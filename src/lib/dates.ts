// The athlete's calendar day. The server runs in UTC, but "today" must follow
// the athlete's timezone (Malaysia by default; override with APP_TIMEZONE).

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kuala_Lumpur";

/** yyyy-mm-dd of `now` in the athlete's timezone. */
export function todayIso(now: Date = new Date(), tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 0 = Sunday .. 6 = Saturday in the athlete's timezone. */
export function weekdayIn(now: Date = new Date(), tz: string = APP_TIMEZONE): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}
