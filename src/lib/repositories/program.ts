import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const programInclude = {
  templates: {
    where: { archived: false },
    orderBy: { dayOrder: "asc" },
    include: {
      exercises: {
        orderBy: { sortOrder: "asc" },
        include: { exercise: { select: { id: true, name: true, muscleGroup: true, equipment: true } } },
      },
    },
  },
} satisfies Prisma.WorkoutProgramInclude;

export type ProgramWithTemplates = Prisma.WorkoutProgramGetPayload<{ include: typeof programInclude }>;

export const programRepository = {
  list(athleteId: string, includeArchived = false) {
    return prisma.workoutProgram.findMany({
      where: { athleteId, ...(includeArchived ? {} : { archived: false }) },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: programInclude,
    });
  },

  getById(athleteId: string, id: string) {
    return prisma.workoutProgram.findFirst({ where: { id, athleteId }, include: programInclude });
  },

  getTemplate(athleteId: string, id: string) {
    return prisma.workoutTemplate.findFirst({
      where: { id, athleteId, archived: false },
      include: {
        program: { select: { id: true, name: true } },
        exercises: { orderBy: { sortOrder: "asc" }, include: { exercise: true } },
      },
    });
  },

  createProgram(data: Prisma.WorkoutProgramUncheckedCreateInput) {
    return prisma.workoutProgram.create({ data });
  },

  async updateProgram(athleteId: string, id: string, data: Prisma.WorkoutProgramUncheckedUpdateInput) {
    const r = await prisma.workoutProgram.updateMany({ where: { id, athleteId }, data });
    return r.count;
  },

  createTemplate(data: Prisma.WorkoutTemplateUncheckedCreateInput) {
    return prisma.workoutTemplate.create({ data });
  },

  async updateTemplate(athleteId: string, id: string, data: Prisma.WorkoutTemplateUncheckedUpdateInput) {
    const r = await prisma.workoutTemplate.updateMany({ where: { id, athleteId }, data });
    return r.count;
  },

  async replaceTemplateExercises(
    templateId: string,
    rows: Omit<Prisma.WorkoutTemplateExerciseUncheckedCreateInput, "templateId">[]
  ) {
    await prisma.$transaction([
      prisma.workoutTemplateExercise.deleteMany({ where: { templateId } }),
      ...rows.map((r) => prisma.workoutTemplateExercise.create({ data: { ...r, templateId } })),
    ]);
  },

  templateSessionCount(templateId: string) {
    return prisma.workoutSession.count({ where: { templateId } });
  },

  async deleteTemplate(athleteId: string, id: string) {
    await prisma.workoutTemplateExercise.deleteMany({ where: { templateId: id } });
    const r = await prisma.workoutTemplate.deleteMany({ where: { id, athleteId } });
    return r.count;
  },

  async setActiveExclusive(athleteId: string, id: string) {
    await prisma.$transaction([
      prisma.workoutProgram.updateMany({ where: { athleteId }, data: { isActive: false } }),
      prisma.workoutProgram.updateMany({ where: { id, athleteId }, data: { isActive: true } }),
    ]);
  },

  lastCompletedTemplate(athleteId: string, programId: string) {
    return prisma.workoutSession.findFirst({
      where: { athleteId, programId, status: "COMPLETED", templateId: { not: null } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { templateId: true, date: true },
    });
  },

  logProposal(data: Prisma.AIProposalLogUncheckedCreateInput) {
    return prisma.aIProposalLog.create({ data });
  },

  /** Sessions completed per program in a date range (adherence). */
  completedSessions(athleteId: string, since: Date) {
    return prisma.workoutSession.findMany({
      where: { athleteId, status: "COMPLETED", date: { gte: since } },
      select: { id: true, date: true, programId: true, templateId: true },
      orderBy: { date: "asc" },
    });
  },
};
