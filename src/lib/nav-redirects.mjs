// Friendly paths for the consolidated navigation. They redirect to the existing
// pages, which are not moved or removed: bookmarks, coach share links and old
// links keep working.
export const NAV_REDIRECTS = [
  // Workout tabs
  { source: "/dashboard/workout/history", destination: "/dashboard/workouts" },
  { source: "/dashboard/workout/programs", destination: "/dashboard/programs" },
  { source: "/dashboard/workout/exercises", destination: "/dashboard/exercises" },
  // Progress tabs
  { source: "/dashboard/progress/prs", destination: "/dashboard/records" },
  { source: "/dashboard/progress/exercises", destination: "/dashboard/strength" },
  { source: "/dashboard/progress/body", destination: "/dashboard/weight" },
  // Short names
  { source: "/dashboard/prs", destination: "/dashboard/records" },
  { source: "/dashboard/pr", destination: "/dashboard/records" },
  { source: "/dashboard/violet", destination: "/dashboard/coach" },
  { source: "/dashboard/import/whatsapp", destination: "/dashboard/import" },
];
