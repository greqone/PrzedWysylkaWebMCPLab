export interface TextToolResult {
  content: Array<{ type: "text"; text: string }>;
}

export function textToolResult(payload: unknown): TextToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}
