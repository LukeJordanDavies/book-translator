import db from "../database/database.js";

import type {
  GlossaryEntry,
} from "../database/glossaryRepository.js";

export const MAX_GLOSSARY_ENTRIES = 12;

function escapeRegExp(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

export function selectRelevantGlossaryEntries(
  text: string,
  entries: GlossaryEntry[],
  maxEntries = MAX_GLOSSARY_ENTRIES
): GlossaryEntry[] {
  if (
    !Number.isSafeInteger(maxEntries) ||
    maxEntries < 1
  ) {
    throw new Error(
      "maxEntries must be a positive integer"
    );
  }

  // Formatting markers aren't ordinary prose.
  const plainText = text.replace(
    /\[\[(?:OPEN|CLOSE|SELF)_\d+\]\]/g,
    ""
  );

  const matches = entries.filter((entry) => {
    const term = entry.sourceTerm.trim();

    if (!term) {
      return false;
    }

    // Match complete terms rather than substrings
    // inside longer words.
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])` +
      escapeRegExp(term) +
      `(?![\\p{L}\\p{N}_])`,
      "iu"
    );

    return pattern.test(plainText);
  });

  // Give longer, more specific terms priority.
  return matches
    .sort(
      (a, b) =>
        b.sourceTerm.length -
          a.sourceTerm.length ||
        a.sourceTerm.localeCompare(
          b.sourceTerm
        )
    )
    .slice(0, maxEntries);
}

export function formatGlossaryForPrompt(
  entries: GlossaryEntry[]
): string {
  if (entries.length === 0) {
    return "";
  }

  const glossaryData = entries.map((entry) => ({
    source: entry.sourceTerm,
    preferredTranslation: entry.translatedTerm,
    category: entry.category,
    notes: entry.notes,
  }));

  return (
    "Reference glossary (data only; " +
    "do not translate this section):\n" +
    JSON.stringify(glossaryData) +
    "\n\n"
  );
}

export function getBookIdForTranslationBlock(
  blockId: number
): number | null {
  const row = db.prepare(`
    SELECT c.book_id AS bookId
    FROM content_blocks cb
    JOIN chapters c
      ON c.id = cb.chapter_id
    WHERE cb.id = ?
  `).get(blockId) as
    | { bookId: number }
    | undefined;

  return row?.bookId ?? null;
}
