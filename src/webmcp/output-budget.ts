export const MAX_SERIALIZED_TOOL_RESULT_CHARS = 1_500;

export interface TruncatedText {
  value: string;
  truncated: boolean;
}

export function truncateText(
  value: string,
  maxCodePoints: number,
): TruncatedText {
  if (!Number.isInteger(maxCodePoints) || maxCodePoints < 0) {
    throw new Error("Text limit must be a non-negative integer");
  }
  const codePoints = Array.from(value);
  if (codePoints.length <= maxCodePoints) {
    return { value, truncated: false };
  }
  return {
    value: codePoints.slice(0, maxCodePoints).join(""),
    truncated: true,
  };
}

export function assertToolPayloadBudget(payload: unknown, label: string): void {
  if (JSON.stringify(payload).length <= MAX_SERIALIZED_TOOL_RESULT_CHARS)
    return;
  throw new Error(
    `${label} exceeds the ${MAX_SERIALIZED_TOOL_RESULT_CHARS.toLocaleString("en-US")}-character WebMCP output budget`,
  );
}
