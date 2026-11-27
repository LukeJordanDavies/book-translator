export type ContentReviewKind =
  | "possible_omission"
  | "possible_addition"
  | "repeated_translation"
  | "number_mismatch";

export interface ContentReviewFinding {
  kind: ContentReviewKind;
  message: string;
}

const FORMAT_MARKERS =
  /\[\[(?:OPEN|CLOSE|SELF)_\d+\]\]/gu;

const NUMBERS =
  /\d+(?:[.,]\d+)*/gu;

const SENTENCE_BREAK =
  /(?<=[.!?。！？])\s+/u;

function cleanText(text: string): string {
  return text
    .replace(FORMAT_MARKERS, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function digitTokens(text: string): string[] {
  return (text.match(NUMBERS) ?? [])
    .map((number) =>
      number.replace(/[.,]/g, "")
    )
    .sort();
}

function hasAdjacentRepetition(
  text: string
): boolean {
  const sentences = text
    .split(SENTENCE_BREAK)
    .map((sentence) =>
      sentence.trim().toLocaleLowerCase()
    )
    .filter(Boolean);

  return sentences.some(
    (sentence, index) =>
      index > 0 &&
      sentence.length >= 35 &&
      sentence === sentences[index - 1]
  );
}

function sentenceCount(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  return text
    .split(SENTENCE_BREAK)
    .filter(Boolean)
    .length;
}

/**
 * Advisory translation-content checks.
 *
 * Never automatically rejects, rewrites
 * or deletes a saved translation.
 *
 * Accepts plain text rather than raw XHTML.
 */
export function reviewTranslatedContent(
  sourceText: string,
  translatedText: string,
  targetLanguage: string
): ContentReviewFinding[] {
  const source = cleanText(sourceText);
  const translated = cleanText(
    translatedText
  );

  if (!source || !translated) {
    return [];
  }

  const findings: ContentReviewFinding[] = [];

  // Check digit-based numbers.
  // This helps detect changed dates and
  // quantities, but isn't a complete
  // numerical equivalence test.
  const sourceNumbers = digitTokens(source);
  const targetNumbers = digitTokens(
    translated
  );

  if (
    JSON.stringify(sourceNumbers) !==
    JSON.stringify(targetNumbers)
  ) {
    findings.push({
      kind: "number_mismatch",
      message:
        "Numbers differ between the original " +
        "and translation. Check dates, " +
        "quantities, and other numeric details.",
    });
  }

  // Look for accidentally duplicated
  // consecutive sentences.
  if (
    hasAdjacentRepetition(translated) &&
    !hasAdjacentRepetition(source)
  ) {
    findings.push({
      kind: "repeated_translation",
      message:
        "A long sentence appears twice " +
        "consecutively in the translation " +
        "but not in the original. Check for " +
        "accidental duplication.",
    });
  }

  // Character-length comparisons are
  // unreliable for Japanese translations.
  //
  // Other languages may also differ greatly,
  // so these thresholds are deliberately loose.
  if (
    targetLanguage !== "Japanese" &&
    source.length >= 180
  ) {
    const ratio =
      translated.length / source.length;

    const possibleMissingSentences =
      sentenceCount(source) >= 5 &&
      sentenceCount(translated) * 2 <
        sentenceCount(source) &&
      ratio < 0.75;

    // The existing short_translation
    // quality warning covers the most
    // extreme cases (ratio below 0.25).
    if (
      (
        ratio >= 0.25 &&
        ratio < 0.45
      ) ||
      (
        ratio >= 0.25 &&
        possibleMissingSentences
      )
    ) {
      findings.push({
        kind: "possible_omission",
        message:
          "The translated passage appears " +
          "substantially shorter or contains " +
          "far fewer sentences. Compare it " +
          "with the original for omitted content.",
      });
    }

    if (ratio > 2.5) {
      findings.push({
        kind: "possible_addition",
        message:
          "The translated passage is " +
          "substantially longer than the " +
          "original. Check for unnecessary " +
          "additions or repetition.",
      });
    }
  }

  return findings;
}
