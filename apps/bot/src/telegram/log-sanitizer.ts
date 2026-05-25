const REDACTED = "[REDACTED]";

const SECRET_PATTERNS: RegExp[] = [
  // Telegram bot token: 123456:ABC...
  /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g,
  // Authorization headers with bearer token
  /\b(authorization\s*:\s*bearer)\s+[^\s,;"]+/gi,
  // Authorization headers with api-key token
  /\b(authorization\s*:\s*api-key)\s+[^\s,;"]+/gi,
  // yc1_* style API keys
  /\byc1_[A-Za-z0-9_-]{8,}\b/g,
  // token/api_key/apiKey fields in JSON-like strings
  /(["']?(?:api_key|apiKey|token)["']?\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
];

export function sanitizeLogString(value: string): string {
  return SECRET_PATTERNS.reduce((sanitized, pattern) => {
    if (pattern.source.includes("(authorization")) {
      return sanitized.replace(pattern, `$1 ${REDACTED}`);
    }
    if (pattern.source.includes("(?:api_key|apiKey|token)")) {
      return sanitized.replace(pattern, `$1${REDACTED}`);
    }
    return sanitized.replace(pattern, REDACTED);
  }, value);
}

export function stringifyAndSanitize(value: unknown): string | undefined {
  if (value == null) return undefined;
  try {
    if (typeof value === "string") return sanitizeLogString(value);
    return sanitizeLogString(JSON.stringify(value));
  } catch {
    return sanitizeLogString(String(value));
  }
}
