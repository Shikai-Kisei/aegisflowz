const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
];

/** Redacts common credentials and email addresses before requests leave this process. */
export function redactSensitiveText(text: string): string {
  return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, '[REDACTED]'), text);
}

const INJECTION_HEURISTICS = [
  /ignore (all )?(previous|prior) instructions/i,
  /reveal (the )?(system prompt|hidden instructions)/i,
  /disregard (all )?(safety|security) (rules|instructions)/i
];

/** Deliberately conservative keyword heuristics, not a comprehensive prompt-injection detector. */
export function shouldBlockPrompt(text: string): boolean {
  return INJECTION_HEURISTICS.some((pattern) => pattern.test(text));
}
