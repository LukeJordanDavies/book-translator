import db from "./database.js";

export type GlossaryCategory =
  | "character"
  | "place"
  | "term";

export interface GlossaryEntry {
  id: number;
  bookId: number;
  targetLanguage: string;
  sourceTerm: string;
  translatedTerm: string;
  category: GlossaryCategory;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveGlossaryEntryInput {
  bookId: number;
  targetLanguage: string;
  sourceTerm: string;
  translatedTerm: string;
  category: GlossaryCategory;
  notes: string;
}

const ENTRY_COLUMNS = `
  id,
  book_id AS bookId,
  target_language AS targetLanguage,
  source_term AS sourceTerm,
  translated_term AS translatedTerm,
  category,
  notes,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export function createGlossaryRepository(
  connection: typeof db
) {
  function bookExists(bookId: number): boolean {
    const row = connection.prepare(`
      SELECT id
      FROM books
      WHERE id = ?
    `).get(bookId);

    return row !== undefined;
  }

  function getById(
    entryId: number
  ): GlossaryEntry | null {
    const row = connection.prepare(`
      SELECT ${ENTRY_COLUMNS}
      FROM translation_glossary
      WHERE id = ?
    `).get(entryId) as GlossaryEntry | undefined;

    return row ?? null;
  }

  function list(
    bookId: number,
    targetLanguage: string
  ): GlossaryEntry[] {
    return connection.prepare(`
      SELECT ${ENTRY_COLUMNS}
      FROM translation_glossary
      WHERE book_id = ?
        AND target_language = ?
      ORDER BY source_term COLLATE NOCASE, id
    `).all(
      bookId,
      targetLanguage
    ) as GlossaryEntry[];
  }

  function save(
    input: SaveGlossaryEntryInput
  ): GlossaryEntry {
    connection.prepare(`
      INSERT INTO translation_glossary (
        book_id,
        target_language,
        source_term,
        translated_term,
        category,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?)

      ON CONFLICT (
        book_id,
        target_language,
        source_term
      )
      DO UPDATE SET
        translated_term = excluded.translated_term,
        category = excluded.category,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      input.bookId,
      input.targetLanguage,
      input.sourceTerm,
      input.translatedTerm,
      input.category,
      input.notes
    );

    const row = connection.prepare(`
      SELECT ${ENTRY_COLUMNS}
      FROM translation_glossary
      WHERE book_id = ?
        AND target_language = ?
        AND source_term = ?
    `).get(
      input.bookId,
      input.targetLanguage,
      input.sourceTerm
    ) as GlossaryEntry | undefined;

    if (!row) {
      throw new Error(
        "Glossary entry could not be saved"
      );
    }

    return row;
  }

  function remove(
    bookId: number,
    entryId: number
  ): boolean {
    const result = connection.prepare(`
      DELETE FROM translation_glossary
      WHERE id = ?
        AND book_id = ?
    `).run(entryId, bookId);

    return result.changes > 0;
  }

  return {
    bookExists,
    getById,
    list,
    save,
    remove,
  };
}

export const glossaryRepository =
  createGlossaryRepository(db);
