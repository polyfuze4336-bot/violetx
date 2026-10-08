// Minimal in-memory stand-in for the Prisma client, used by tests that render
// pages or run services against the seeded demo dataset without a database.
// It supports the read patterns the repositories use and RECORDS every write
// attempt so tests can assert that a read-only session never writes.

type Row = Record<string, unknown>;

interface Relation {
  target: string;
  kind: "one" | "many";
  /** one: local FK column. many: FK column on the target table. */
  fk: string;
}

const RELATIONS: Record<string, Record<string, Relation>> = {
  workoutSession: {
    gymBranch: { target: "gymBranch", kind: "one", fk: "gymBranchId" },
    program: { target: "workoutProgram", kind: "one", fk: "programId" },
    template: { target: "workoutTemplate", kind: "one", fk: "templateId" },
    entries: { target: "exerciseEntry", kind: "many", fk: "sessionId" },
    exercises: { target: "workoutExercise", kind: "many", fk: "sessionId" },
  },
  workoutExercise: {
    exercise: { target: "exercise", kind: "one", fk: "exerciseId" },
    session: { target: "workoutSession", kind: "one", fk: "sessionId" },
    sets: { target: "exerciseEntry", kind: "many", fk: "workoutExerciseId" },
  },
  exerciseEntry: {
    exercise: { target: "exercise", kind: "one", fk: "exerciseId" },
    session: { target: "workoutSession", kind: "one", fk: "sessionId" },
  },
  measurementEntry: { type: { target: "measurementType", kind: "one", fk: "typeId" } },
  gymVisit: { gymBranch: { target: "gymBranch", kind: "one", fk: "gymBranchId" } },
  workoutProgram: {
    templates: { target: "workoutTemplate", kind: "many", fk: "programId" },
    sessions: { target: "workoutSession", kind: "many", fk: "programId" },
  },
  workoutTemplate: {
    program: { target: "workoutProgram", kind: "one", fk: "programId" },
    exercises: { target: "workoutTemplateExercise", kind: "many", fk: "templateId" },
  },
  workoutTemplateExercise: { exercise: { target: "exercise", kind: "one", fk: "exerciseId" } },
};

const WRITE_METHODS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

const cmp = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : Number(a) - Number(b);

function matches(value: unknown, cond: unknown): boolean {
  // A column that was never set reads as NULL, like the database.
  if (cond === null) return value === null || value === undefined;
  if (typeof cond !== "object" || cond instanceof Date) {
    return value instanceof Date && cond instanceof Date ? value.getTime() === cond.getTime() : value === cond;
  }
  return Object.entries(cond as Record<string, unknown>).every(([op, v]) => {
    switch (op) {
      case "equals":
        return matches(value, v);
      case "not":
        return !matches(value, v);
      case "in":
        return (v as unknown[]).some((x) => matches(value, x));
      case "gte":
        return value != null && cmp(value, v) >= 0;
      case "gt":
        return value != null && cmp(value, v) > 0;
      case "lte":
        return value != null && cmp(value, v) <= 0;
      case "lt":
        return value != null && cmp(value, v) < 0;
      case "contains":
        return String(value ?? "").toLowerCase().includes(String(v).toLowerCase());
      default:
        throw new Error(`fake-prisma: unsupported operator "${op}"`);
    }
  });
}

function where(row: Row, w: Record<string, unknown> | undefined): boolean {
  if (!w) return true;
  return Object.entries(w).every(([k, v]) => {
    if (k === "OR") return (v as Record<string, unknown>[]).some((x) => where(row, x));
    if (k === "AND") return (v as Record<string, unknown>[]).every((x) => where(row, x));
    return matches(row[k], v);
  });
}

function sortRows(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy) return rows;
  const list = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, "asc" | "desc">[];
  return [...rows].sort((a, b) => {
    for (const o of list) {
      const [k, dir] = Object.entries(o)[0];
      const av = a[k];
      const bv = b[k];
      const d = av instanceof Date && bv instanceof Date ? av.getTime() - bv.getTime() : av === bv ? 0 : (av as number) < (bv as number) ? -1 : 1;
      if (d !== 0) return dir === "desc" ? -d : d;
    }
    return 0;
  });
}

interface FindArgs {
  where?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  skip?: number;
  include?: Record<string, unknown>;
}

export class FakePrisma {
  /** Every attempted write, e.g. "exercise.create". Tests assert this stays empty. */
  readonly writes: string[] = [];

  private seq = 0;

  /**
   * @param writable when true, writes are APPLIED (so a whole user journey can run
   * against real services); when false (default) they are only recorded.
   */
  constructor(
    readonly tables: Record<string, Row[]>,
    private readonly writable = false
  ) {}

  private apply = (model: string, method: string, args: Record<string, unknown>): unknown => {
    const rows = (this.tables[model] ??= []);
    const now = new Date();
    const build = (data: Row): Row => ({
      id: `gen-${model}-${++this.seq}`,
      createdAt: now,
      updatedAt: now,
      ...data,
    });
    const patch = (row: Row, data: Row) => {
      for (const [k, v] of Object.entries(data)) {
        row[k] = v && typeof v === "object" && !(v instanceof Date) && "set" in (v as Row) ? (v as Row).set : v;
      }
      row.updatedAt = now;
    };
    const w = args.where as Record<string, unknown> | undefined;
    switch (method) {
      case "create": {
        const row = build(args.data as Row);
        rows.push(row);
        return this.resolve(model, row, args.include as Record<string, unknown> | undefined);
      }
      case "createMany": {
        const data = args.data as Row[];
        data.forEach((d) => rows.push(build(d)));
        return { count: data.length };
      }
      case "update": {
        const hit = rows.find((r) => where(r, w));
        if (!hit) throw new Error(`fake-prisma: ${model}.update found nothing`);
        patch(hit, args.data as Row);
        return hit;
      }
      case "updateMany": {
        const hits = rows.filter((r) => where(r, w));
        hits.forEach((h) => patch(h, args.data as Row));
        return { count: hits.length };
      }
      case "upsert": {
        const hit = rows.find((r) => where(r, w));
        if (hit) {
          patch(hit, args.update as Row);
          return hit;
        }
        const row = build({ ...(w ?? {}), ...(args.create as Row) });
        rows.push(row);
        return row;
      }
      case "delete":
      case "deleteMany": {
        const keep = rows.filter((r) => !where(r, w));
        const count = rows.length - keep.length;
        this.tables[model] = keep;
        return method === "delete" ? {} : { count };
      }
      default:
        throw new Error(`fake-prisma: unsupported write ${model}.${method}`);
    }
  };

  private resolve = (model: string, row: Row, include: Record<string, unknown> | undefined): Row => {
    if (!include) return row;
    const out: Row = { ...row };
    for (const [name, spec] of Object.entries(include)) {
      if (!spec) continue;
      const rel = RELATIONS[model]?.[name];
      if (!rel) throw new Error(`fake-prisma: no relation ${model}.${name}`);
      const nested = typeof spec === "object" ? (spec as FindArgs) : {};
      const table = this.tables[rel.target] ?? [];
      if (rel.kind === "one") {
        const hit = table.find((r) => r.id === row[rel.fk]) ?? null;
        out[name] = hit ? this.resolve(rel.target, hit, nested.include) : null;
      } else {
        const hits = sortRows(
          table.filter((r) => r[rel.fk] === row.id && where(r, nested.where)),
          nested.orderBy
        );
        out[name] = hits.map((h) => this.resolve(rel.target, h, nested.include));
      }
    }
    return out;
  };

  private delegate = (model: string) => {
    const rows = () => (this.tables[model] ??= []);
    const find = (args: FindArgs = {}) => {
      let list = sortRows(rows().filter((r) => where(r, args.where)), args.orderBy);
      if (args.skip) list = list.slice(args.skip);
      if (args.take !== undefined) list = list.slice(0, args.take);
      return list.map((r) => this.resolve(model, r, args.include));
    };
    return new Proxy(
      {},
      {
        get: (_t, method: string) => {
          if (WRITE_METHODS.has(method)) {
            return async (args: Record<string, unknown> = {}) => {
              this.writes.push(`${model}.${method}`);
              if (this.writable) return this.apply(model, method, args);
              return method.endsWith("Many") ? { count: 0 } : {};
            };
          }
          switch (method) {
            case "findMany":
              return async (args?: FindArgs) => find(args);
            case "findFirst":
              return async (args?: FindArgs) => find({ ...args, take: 1 })[0] ?? null;
            case "findUnique":
            case "findUniqueOrThrow":
              return async (args: FindArgs) => find({ ...args, take: 1 })[0] ?? null;
            case "count":
              return async (args?: { where?: Record<string, unknown> }) => rows().filter((r) => where(r, args?.where)).length;
            case "aggregate":
              return async (args?: { where?: Record<string, unknown>; _max?: Record<string, boolean>; _min?: Record<string, boolean> }) => {
                const hits = rows().filter((r) => where(r, args?.where));
                const pick = (fields: Record<string, boolean> | undefined, fn: (n: number[]) => number) =>
                  Object.fromEntries(
                    Object.keys(fields ?? {}).map((f) => {
                      const vals = hits.map((r) => r[f]).filter((v) => typeof v === "number") as number[];
                      return [f, vals.length ? fn(vals) : null];
                    })
                  );
                return { _max: pick(args?._max, (v) => Math.max(...v)), _min: pick(args?._min, (v) => Math.min(...v)), _count: hits.length };
              };
            default:
              throw new Error(`fake-prisma: unsupported ${model}.${method}`);
          }
        },
      }
    );
  };

  /** Use as the module export `prisma`. */
  client = (): Record<string, unknown> =>
    new Proxy<Record<string, unknown>>(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "$transaction") {
            return async (arg: unknown) => {
              this.writes.push("$transaction");
              if (typeof arg === "function") return (arg as (c: unknown) => unknown)(this.client());
              return this.writable ? Promise.all(arg as Promise<unknown>[]) : [];
            };
          }
          if (prop === "$executeRaw" || prop === "$queryRaw") {
            return async () => {
              this.writes.push(prop);
              return 0;
            };
          }
          if (prop === "then") return undefined;
          return this.delegate(prop);
        },
      }
    );
}
