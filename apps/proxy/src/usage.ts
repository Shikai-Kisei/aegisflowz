const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 }
};

export function estimateUsage(text: string): { tokens: number } {
  return { tokens: Math.ceil(text.length / 4) };
}

/** Returns an estimate only; actual provider billing can vary by model and tokenization. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES_PER_MILLION[model] ?? { input: 0, output: 0 };
  return Number(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(8));
}
