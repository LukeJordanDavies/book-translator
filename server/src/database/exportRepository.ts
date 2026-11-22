import db from "./database.js";

export interface ExportBlock {
  id: number;
  chapterId: number;
  type: "heading" | "paragraph";
  sourcePath: string;
  elementPath: string;
  originalHtml: string;
  translatedHtml: string | null;
}

export function getOriginalEpub(
  bookId: number
): Buffer | null {
  const row = db.prepare(`
    SELECT epub_data
    FROM book_files
    WHERE book_id = ?
  `).get(bookId) as
    | { epub_data: Buffer }
    | undefined;

  return row?.epub_data ?? null;
}

export function getExportBlocks(
  bookId: number,
  targetLanguage: string,
  style: string,
  contextMode: string
): ExportBlock[] {
  return db.prepare(`
    SELECT
      cb.id,
      cb.chapter_id AS chapterId,
      cb.type AS type,
      cb.source_path AS sourcePath,
      cb.element_path AS elementPath,
      cb.html AS originalHtml,
      t.translated_html AS translatedHtml
    FROM content_blocks cb
    JOIN chapters c ON c.id = cb.chapter_id
    LEFT JOIN translations t
      ON t.block_id = cb.id
      AND t.target_language = ?
      AND t.style = ?
      AND t.context_mode = ?
    WHERE c.book_id = ?
      AND cb.type IN ('heading', 'paragraph')
      AND TRIM(cb.text) != ''
    ORDER BY c.position, cb.position
  `).all(
    targetLanguage,
    style,
    contextMode,
    bookId
  ) as ExportBlock[];
}
