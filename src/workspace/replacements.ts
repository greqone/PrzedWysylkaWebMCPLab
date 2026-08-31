export interface ExactReplacement {
  search: string;
  replacement: string;
  reason: string;
}

export interface AppliedReplacement extends ExactReplacement {
  start: number;
  end: number;
}

export interface ReplacementApplication {
  content: string;
  changes: AppliedReplacement[];
}

export function applyExactReplacements(
  source: string,
  replacements: ExactReplacement[],
): ReplacementApplication {
  if (replacements.length === 0 || replacements.length > 20) {
    throw new Error("A proposal must contain between 1 and 20 replacements");
  }

  const changes = replacements.map((replacement) => {
    if (!replacement.search)
      throw new Error("Replacement search cannot be empty");
    if (!replacement.reason.trim()) {
      throw new Error("Every replacement requires a reason");
    }

    const start = source.indexOf(replacement.search);
    if (start === -1) {
      throw new Error(
        `Replacement search was not found: ${replacement.search}`,
      );
    }
    if (source.indexOf(replacement.search, start + 1) !== -1) {
      throw new Error(`Replacement search is ambiguous: ${replacement.search}`);
    }

    return {
      ...replacement,
      start,
      end: start + replacement.search.length,
    };
  });

  const ordered = [...changes].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous && current && current.start < previous.end) {
      throw new Error("Replacement searches overlap");
    }
  }

  let content = source;
  for (const change of [...ordered].reverse()) {
    content =
      content.slice(0, change.start) +
      change.replacement +
      content.slice(change.end);
  }

  return { content, changes: ordered };
}
