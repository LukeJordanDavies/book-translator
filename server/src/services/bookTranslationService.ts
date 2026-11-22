import db from "../database/database.js";

import type {
  TranslationOptions,
} from "./translationService.js";

import {
  buildBookTranslationProgress,
  type BookTranslationProgress,
  type ChapterCounts,
} from "./bookTranslationProgress.js";

export function getBookTranslationProgress(
  bookId: number,
  settings: TranslationOptions
): BookTranslationProgress | null {
  const book = db
    .prepare(
      "SELECT id FROM books WHERE id = ?"
    )
    .get(bookId);

  if (!book) {
    return null;
  }

  const rows = db.prepare(`
    SELECT
      c.id AS chapterId,
      c.position AS position,

      COUNT(cb.id) AS total,

      SUM(
        CASE
          WHEN
            t.translated_html IS NOT NULL
            AND TRIM(t.translated_html) != ''
          THEN 1
          ELSE 0
        END
      ) AS completed

    FROM chapters c

    LEFT JOIN content_blocks cb
      ON cb.chapter_id = c.id
      AND cb.type IN ('heading', 'paragraph')
      AND TRIM(COALESCE(cb.text, '')) != ''

    LEFT JOIN translations t
      ON t.block_id = cb.id
      AND t.target_language = ?
      AND t.style = ?
      AND t.context_mode = ?

    WHERE c.book_id = ?

    GROUP BY c.id, c.position

    ORDER BY c.position, c.id
  `).all(
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
    bookId
  ) as ChapterCounts[];

  return buildBookTranslationProgress(
    bookId,
    rows
  );
}


export function getChapterOriginalId(
  bookId: number,
  chapterDatabaseId: number
): string | null {
  const row = db.prepare(`
    SELECT original_id AS originalId
    FROM chapters
    WHERE book_id = ?
      AND id = ?
  `).get(
    bookId,
    chapterDatabaseId
  ) as { originalId: string } | undefined;

  return row?.originalId ?? null;
}

