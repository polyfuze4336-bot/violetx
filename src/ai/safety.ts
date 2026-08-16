// AI safety: WhatsApp/chat text is UNTRUSTED. It becomes structured data only,
// never instructions. Interpretation runs through the deterministic parser, so
// injected commands cannot change system rules, call tools, or execute SQL.

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|your\s+|the\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+|your\s+)?(previous|prior)\s+/i,
  /delete\s+(all|every|everything|each)\b/i,
  /drop\s+table/i,
  /truncate\s+table/i,
  /system\s+prompt/i,
  /you\s+are\s+now\b/i,
  /reveal\s+(the\s+)?(secret|api\s*key|password)/i,
  /grant\s+(me\s+)?(owner|admin)/i,
];

/** Detect a likely prompt-injection attempt (for logging/telemetry only). */
export function detectInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}
