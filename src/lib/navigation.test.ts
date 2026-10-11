import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

let currentPath = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => currentPath, useRouter: () => ({ push: vi.fn() }) }));

import { NAV_REDIRECTS } from "@/lib/nav-redirects.mjs";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { SidebarNav } from "@/components/dashboard/sidebar";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import {
  MORE_GROUPS,
  PROGRESS_TABS,
  QUICK_ACTIONS,
  WORKOUT_TABS,
  isTabActive,
  moreGroupsFor,
  primaryNavFor,
  sectionOf,
  tabsFor,
} from "@/components/dashboard/nav-config";

const DASHBOARD_DIR = path.join(process.cwd(), "src", "app", "dashboard");
const routeDirs = readdirSync(DASHBOARD_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

/** Every <a href> in rendered markup, with the label text and aria-current flag. */
function links(html: string) {
  return Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)).map((m) => ({
    href: /href="([^"]*)"/.exec(m[1])?.[1] ?? "",
    current: /aria-current="page"/.test(m[1]),
    text: m[2].replace(/<[^>]*>/g, "").trim(),
  }));
}

const render = (at: string, el: () => ReturnType<typeof createElement>) => {
  currentPath = at;
  return renderToStaticMarkup(el());
};

describe("primary navigation: exactly five destinations", () => {
  it("the athlete gets Home, Workout, Progress, Violet, More", () => {
    const items = primaryNavFor("OWNER");
    expect(items.map((i) => i.label)).toEqual(["Home", "Workout", "Progress", "Violet", "More"]);
    expect(items.map((i) => i.href)).toEqual(["/dashboard", "/dashboard/workout", "/dashboard/progress", "/dashboard/coach", "/dashboard/more"]);
  });

  it("the read-only demo viewer also gets five; Workout opens the history (it cannot start one)", () => {
    const items = primaryNavFor("DEMO_VIEWER");
    expect(items.map((i) => i.label)).toEqual(["Home", "Workout", "Progress", "Violet", "More"]);
    expect(items[1].href).toBe("/dashboard/workouts");
  });

  it("a coach has no Violet; nothing owner-only is offered", () => {
    const items = primaryNavFor("COACH");
    expect(items.map((i) => i.label)).toEqual(["Home", "Workout", "Progress", "More"]);
    expect(items[1].href).toBe("/dashboard/workouts");
  });

  it("highlights the right destination for every route; secondary pages highlight More", () => {
    const expected: Record<string, string> = {
      "/dashboard": "home",
      "/dashboard/workout": "workout",
      "/dashboard/workouts": "workout",
      "/dashboard/programs": "workout",
      "/dashboard/exercises": "workout",
      "/dashboard/exercises/abc": "workout",
      "/dashboard/import": "workout",
      "/dashboard/progress": "progress",
      "/dashboard/records": "progress",
      "/dashboard/strength": "progress",
      "/dashboard/weight": "progress",
      "/dashboard/measurements": "progress",
      "/dashboard/coach": "violet",
      "/dashboard/more": "more",
      "/dashboard/nutrition": "more",
      "/dashboard/recovery": "more",
      "/dashboard/goals": "more",
      "/dashboard/gym": "more",
      "/dashboard/settings": "more",
      "/dashboard/review": "more",
      "/dashboard/analytics": "more",
      "/dashboard/compare": "more",
      "/dashboard/history": "more",
      "/dashboard/notes": "more",
    };
    for (const [p, key] of Object.entries(expected)) expect(sectionOf(p), p).toBe(key);
  });

  it("every existing dashboard page is still reachable from the new navigation (nothing was lost)", () => {
    const reachable = new Set<string>();
    for (const i of primaryNavFor("OWNER")) reachable.add(i.href);
    for (const t of [...WORKOUT_TABS, ...PROGRESS_TABS]) {
      reachable.add(t.href);
      t.sub?.forEach((s) => reachable.add(s.href));
    }
    for (const g of MORE_GROUPS) g.items.forEach((i) => reachable.add(i.href.split("#")[0]));
    Object.values(QUICK_ACTIONS).forEach((a) => reachable.add(a.href));

    const previousNav = [
      "/dashboard/workout", "/dashboard/workouts", "/dashboard/programs", "/dashboard/review", "/dashboard/goals",
      "/dashboard/recovery", "/dashboard/coach", "/dashboard/progress", "/dashboard/analytics", "/dashboard/weight",
      "/dashboard/strength", "/dashboard/measurements", "/dashboard/nutrition", "/dashboard/gym", "/dashboard/history",
      "/dashboard/records", "/dashboard/import", "/dashboard/settings", "/dashboard/exercises", "/dashboard/compare",
    ];
    for (const href of previousNav) {
      expect(reachable.has(href), href).toBe(true);
      expect(existsSync(path.join(DASHBOARD_DIR, href.split("/").pop()!, "page.tsx")), href).toBe(true);
    }
  });
});

describe("desktop sidebar and mobile bottom bar", () => {
  it("the sidebar lists the five primary destinations only", () => {
    const html = render("/dashboard/records", () => createElement(SidebarNav, { role: "OWNER" }));
    const l = links(html);
    expect(l.map((x) => x.text)).toEqual(["Home", "Workout", "Progress", "Violet", "More"]);
    expect(l.filter((x) => x.current).map((x) => x.text)).toEqual(["Progress"]); // PRs live under Progress
  });

  it("the bottom bar shows the same five, with More as a link (no drawer)", () => {
    const html = render("/dashboard/nutrition", () => createElement(BottomNav, { role: "OWNER" }));
    const l = links(html);
    expect(l.map((x) => x.text)).toEqual(["Home", "Workout", "Progress", "Violet", "More"]);
    expect(l.find((x) => x.text === "More")).toMatchObject({ href: "/dashboard/more", current: true });
    expect(html).not.toContain("<button");
  });

  it("a secondary page highlights More, never a different primary item", () => {
    for (const p of ["/dashboard/goals", "/dashboard/gym", "/dashboard/settings", "/dashboard/review"]) {
      const l = links(render(p, () => createElement(SidebarNav, { role: "OWNER" })));
      expect(l.filter((x) => x.current).map((x) => x.text), p).toEqual(["More"]);
    }
  });
});

describe("tabs inside Workout and Progress", () => {
  it("Workout: Today, History, Programs, Exercises (Today is owner-only)", () => {
    expect(tabsFor(WORKOUT_TABS, "OWNER").map((t) => t.label)).toEqual(["Today", "History", "Programs", "Exercises"]);
    expect(tabsFor(WORKOUT_TABS, "DEMO_VIEWER").map((t) => t.label)).toEqual(["History", "Programs", "Exercises"]);
    expect(tabsFor(WORKOUT_TABS, "COACH").map((t) => t.label)).toEqual(["History", "Programs", "Exercises"]);
  });

  it("Progress: Overview, PRs, Exercises, Body", () => {
    expect(tabsFor(PROGRESS_TABS, "OWNER").map((t) => t.label)).toEqual(["Overview", "PRs", "Exercises", "Body"]);
  });

  it("highlights the active tab; Body covers weight and measurements; Today is not History", () => {
    const body = PROGRESS_TABS.find((t) => t.label === "Body")!;
    expect(isTabActive(body, "/dashboard/weight")).toBe(true);
    expect(isTabActive(body, "/dashboard/measurements")).toBe(true);
    expect(isTabActive(body, "/dashboard/records")).toBe(false);
    const today = WORKOUT_TABS[0];
    expect(isTabActive(today, "/dashboard/workout")).toBe(true);
    expect(isTabActive(today, "/dashboard/workouts")).toBe(false);
    expect(isTabActive(WORKOUT_TABS[3], "/dashboard/exercises/abc")).toBe(true);
  });

  it("renders as links to the existing pages, with the Body switcher under Body", () => {
    const html = render("/dashboard/measurements", () => createElement(SectionTabs, { tabs: PROGRESS_TABS, label: "Progress sections", role: "OWNER" }));
    const l = links(html);
    expect(l.slice(0, 4).map((x) => [x.text, x.href])).toEqual([
      ["Overview", "/dashboard/progress"],
      ["PRs", "/dashboard/records"],
      ["Exercises", "/dashboard/strength"],
      ["Body", "/dashboard/weight"],
    ]);
    expect(l.find((x) => x.text === "Body")!.current).toBe(true);
    expect(l.slice(4).map((x) => [x.text, x.current])).toEqual([["Weight", false], ["Measurements", true]]);
  });
});

describe("More menu", () => {
  const titles = (role: "OWNER" | "DEMO_VIEWER" | "COACH") => moreGroupsFor(role).map((g) => g.title);
  const hrefs = (role: "OWNER" | "DEMO_VIEWER" | "COACH") => moreGroupsFor(role).flatMap((g) => g.items.map((i) => i.href));

  it("groups the secondary features and keeps them all", () => {
    expect(titles("OWNER")).toEqual(["Training insights", "Health & tracking", "Journey", "Sharing", "Account"]);
    expect(hrefs("OWNER")).toEqual(
      expect.arrayContaining([
        "/dashboard/nutrition", "/dashboard/recovery", "/dashboard/measurements", "/dashboard/goals",
        "/dashboard/gym", "/dashboard/records", "/dashboard/settings#coach-share", "/dashboard/settings",
      ])
    );
  });

  it("hides owner-only items from the demo viewer and coaches", () => {
    expect(hrefs("DEMO_VIEWER")).toContain("/dashboard/nutrition"); // read-only view works for the demo
    expect(hrefs("DEMO_VIEWER")).not.toContain("/dashboard/settings");
    expect(hrefs("DEMO_VIEWER")).not.toContain("/dashboard/settings#coach-share");
    expect(hrefs("COACH")).not.toContain("/dashboard/nutrition");
    expect(titles("COACH")).not.toContain("Account");
    expect(titles("COACH")).not.toContain("Sharing");
  });
});

describe("route consolidation and redirects", () => {
  it("every redirect points to a real page and none shadows an existing one", () => {
    for (const r of NAV_REDIRECTS) {
      const dest = r.destination.split("/")[2];
      expect(routeDirs, r.destination).toContain(dest);
      expect(existsSync(path.join(DASHBOARD_DIR, dest, "page.tsx")), r.destination).toBe(true);
      // The source must not be a real route (that would hide a working page).
      const parts = r.source.split("/").filter(Boolean).slice(1);
      expect(existsSync(path.join(DASHBOARD_DIR, ...parts, "page.tsx")), r.source).toBe(false);
      expect(r.source.startsWith("/dashboard/")).toBe(true);
    }
    expect(new Set(NAV_REDIRECTS.map((r) => r.source)).size).toBe(NAV_REDIRECTS.length);
  });

  it("maps the Workout and Progress tab names onto the existing pages", () => {
    const to = (s: string) => NAV_REDIRECTS.find((r) => r.source === s)?.destination;
    expect(to("/dashboard/workout/history")).toBe("/dashboard/workouts");
    expect(to("/dashboard/workout/programs")).toBe("/dashboard/programs");
    expect(to("/dashboard/workout/exercises")).toBe("/dashboard/exercises");
    expect(to("/dashboard/progress/prs")).toBe("/dashboard/records");
    expect(to("/dashboard/progress/exercises")).toBe("/dashboard/strength");
    expect(to("/dashboard/progress/body")).toBe("/dashboard/weight");
    expect(to("/dashboard/violet")).toBe("/dashboard/coach");
  });

  it("leaves coach share links and the sign-in route alone", () => {
    expect(NAV_REDIRECTS.every((r) => !r.source.startsWith("/share") && !r.source.startsWith("/coach") && !r.source.startsWith("/signin"))).toBe(true);
  });
});
