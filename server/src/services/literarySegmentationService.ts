interface Boundary {
  position: number;
  priority: number;
}

const FORMAT_MARKER =
  /\[\[(?:OPEN|CLOSE|SELF)_\d+\]\]/;

const RAW_TAG =
  /<\/?[A-Za-z][^>]*>/;

const ABBREVIATION =
  /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|vs|etc|e\.g|i\.e)\.$/i;

function collectBoundaries(
  text: string
): Boundary[] {
  const boundaries: Boundary[] = [];

  for (let i = 0; i < text.length;) {
    if (!/\s/u.test(text[i])) {
      i++;
      continue;
    }

    const start = i;

    while (
      i < text.length &&
      /\s/u.test(text[i])
    ) {
      i++;
    }

    if (i === text.length) {
      break;
    }

    const whitespace = text.slice(
      start,
      i
    );

    // Inspect the end of the preceding
    // sentence, excluding closing quotes
    // and brackets.
    const before = text
      .slice(
        Math.max(0, start - 64),
        start
      )
      .replace(/["'”’»)\]]+$/u, "");

    let priority = 0;

    // Highest priority:
    // paragraph and line breaks.
    if (/[\r\n]/u.test(whitespace)) {
      priority = 3;
    }

    // Next priority:
    // complete sentence endings.
    else if (
      /[.!?…]$/u.test(before) &&
      !ABBREVIATION.test(before)
    ) {
      priority = 2;
    }

    // Lower priority:
    // natural clause boundaries.
    else if (/[;:]$/u.test(before)) {
      priority = 1;
    }

    // Ordinary whitespace has priority 0.
    boundaries.push({
      position: i,
      priority,
    });
  }

  return boundaries;
}

/**
 * Improve the segment boundaries produced
 * by the existing translation splitter.
 *
 * The function never changes the joined
 * source text or increases the maximum
 * existing segment length.
 *
 * Formatting-marker passages are returned
 * unchanged to protect the existing XHTML
 * translation workflow.
 */
export function improveLiterarySegments(
  originalSegments: readonly string[]
): string[] {
  const original = [
    ...originalSegments,
  ];

  if (original.length < 2) {
    return original;
  }

  const source = original.join("");

  // Preserve the proven existing segmentation
  // for passages containing formatting markers
  // or raw HTML elements.
  if (
    FORMAT_MARKER.test(source) ||
    RAW_TAG.test(source)
  ) {
    return original;
  }

  const maxLength = Math.max(
    ...original.map(
      (segment) => segment.length
    )
  );

  if (maxLength < 8) {
    return original;
  }

  const boundaries = collectBoundaries(
    source
  );

  const improved: string[] = [];

  let start = 0;

  while (
    source.length - start > maxLength
  ) {
    const candidates = boundaries.filter(
      (boundary) =>
        boundary.position > start &&
        boundary.position <=
          start + maxLength
    );

    // If no safe whitespace boundary exists,
    // retain the original segmentation.
    if (candidates.length === 0) {
      return original;
    }

    // Prefer not to create exceptionally
    // short segments.
    const preferred = candidates.filter(
      (boundary) =>
        boundary.position - start >=
          maxLength * 0.45
    );

    let chosen =
      candidates[candidates.length - 1];

    if (preferred.length > 0) {
      chosen = preferred.reduce(
        (best, next) =>
          next.priority > best.priority ||
          (
            next.priority ===
              best.priority &&
            next.position > best.position
          )
            ? next
            : best
      );
    }

    improved.push(
      source.slice(
        start,
        chosen.position
      )
    );

    start = chosen.position;
  }

  improved.push(
    source.slice(start)
  );

  // Never multiply the request count
  // unexpectedly, exceed the old length
  // limit, or change the source text.
  if (
    improved.length >
      original.length + 1 ||
    improved.some(
      (segment) =>
        segment.length > maxLength
    ) ||
    improved.join("") !== source
  ) {
    return original;
  }

  return improved;
}
