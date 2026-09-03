export interface ExactSourceWindow {
  text: string;
  totalLines: number;
  endLine: number;
  hasMore: boolean;
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\r") {
      if (source[index + 1] === "\n") index += 1;
      starts.push(index + 1);
    } else if (character === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineContentEnd(
  source: string,
  lineStart: number,
  nextLineStart: number,
): number {
  let end = nextLineStart;
  if (end > lineStart && source[end - 1] === "\n") {
    end -= 1;
    if (end > lineStart && source[end - 1] === "\r") end -= 1;
  } else if (end > lineStart && source[end - 1] === "\r") {
    end -= 1;
  }
  return end;
}

export function sliceSourceWindow(
  source: string,
  startLine: number,
  startColumn: number,
  lineCount: number,
): ExactSourceWindow {
  if (!Number.isInteger(startLine) || startLine < 1) {
    throw new Error("startLine must be a positive integer");
  }
  if (!Number.isInteger(startColumn) || startColumn < 0) {
    throw new Error("startColumn must be a non-negative integer");
  }
  if (!Number.isInteger(lineCount) || lineCount < 1) {
    throw new Error("lineCount must be a positive integer");
  }

  const starts = lineStarts(source);
  const startIndex = startLine - 1;
  const startOffset = starts[startIndex];
  if (startOffset === undefined) {
    throw new Error("startLine exceeds the official asset length");
  }
  const nextLineStart = starts[startIndex + 1] ?? source.length;
  const contentEnd = lineContentEnd(source, startOffset, nextLineStart);
  if (startColumn > contentEnd - startOffset) {
    throw new Error("startColumn exceeds the selected line length");
  }

  const endExclusive = Math.min(starts.length, startIndex + lineCount);
  const endOffset = starts[endExclusive] ?? source.length;
  return {
    text: source.slice(startOffset + startColumn, endOffset),
    totalLines: starts.length,
    endLine: endExclusive,
    hasMore: endOffset < source.length,
  };
}

export function sourceCursorAfter(
  source: string,
  consumedCharacters: number,
  startLine: number,
  startColumn: number,
): { line: number; column: number } {
  let line = startLine;
  let column = startColumn;
  for (let index = 0; index < consumedCharacters; index += 1) {
    const character = source[index];
    if (character === "\r") {
      if (index + 1 < consumedCharacters && source[index + 1] === "\n") {
        index += 1;
      }
      line += 1;
      column = 0;
    } else if (character === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

export function safeSourceBoundary(source: string, boundary: number): number {
  if (boundary <= 0 || boundary >= source.length) return boundary;
  const previous = source.charCodeAt(boundary - 1);
  const next = source.charCodeAt(boundary);
  const splitsSurrogatePair =
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    next >= 0xdc00 &&
    next <= 0xdfff;
  if (splitsSurrogatePair) return boundary - 1;
  if (source[boundary - 1] === "\r" && source[boundary] === "\n") {
    return boundary - 1;
  }
  return boundary;
}
