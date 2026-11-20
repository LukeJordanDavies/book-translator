export interface TextSegment {
  text: string;
  separator: string;
}

export function splitTextIntoSegments(
  text: string,
  maxCharacters = 3000
): TextSegment[] {
  if (
    !Number.isSafeInteger(maxCharacters) ||
    maxCharacters <= 0
  ) {
    throw new Error(
      "maxCharacters must be a positive integer"
    );
  }

  if (!text.length) {
    return [];
  }

  const segments: TextSegment[] = [];

  let segmentStart = 0;
  let formattingDepth = 0;

  let lastSentenceBoundary = -1;
  let lastWhitespaceBoundary = -1;

  const tokenPattern =
    /\[\[(OPEN|CLOSE)_\d+\]\]|\s+|[.!?…]+|[\s\S]/gu;

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index!;
    const tokenEnd = index + token.length;

    if (match[1] === "OPEN") {
      formattingDepth++;
    } else if (match[1] === "CLOSE") {
      formattingDepth--;
    }

    if (formattingDepth !== 0) {
      continue;
    }

    if (/^\s+$/.test(token)) {
      lastWhitespaceBoundary = tokenEnd;

      const precedingText =
        text.slice(segmentStart, index);

      if (/[.!?…]["'”’»)]*$/.test(precedingText)) {
        lastSentenceBoundary = tokenEnd;
      }
    }

    if (tokenEnd - segmentStart < maxCharacters) {
      continue;
    }

    const boundary =
      lastSentenceBoundary > segmentStart
        ? lastSentenceBoundary
        : lastWhitespaceBoundary;

    if (boundary <= segmentStart) {
      continue;
    }

    const rawSegment = text.slice(
      segmentStart,
      boundary
    );

    const segmentText = rawSegment.trimEnd();

    const separator = rawSegment.slice(
      segmentText.length
    );

    if (!segmentText.trim()) {
      continue;
    }

    segments.push({
      text: segmentText,
      separator,
    });

    segmentStart = boundary;

    lastSentenceBoundary = -1;
    lastWhitespaceBoundary = -1;
  }

  if (segmentStart < text.length) {
    segments.push({
      text: text.slice(segmentStart),
      separator: "",
    });
  }

  return segments;
}


export function joinTextSegments(
  segments: TextSegment[]
): string {
  return segments
    .map(
      (segment) =>
        segment.text + segment.separator
    )
    .join("");
}

