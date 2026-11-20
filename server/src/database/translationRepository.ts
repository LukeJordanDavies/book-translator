import db from "./database.js";

export interface SavedTranslation {
  id: number;
  block_id: number;
  target_language: string;
  style: string;
  context_mode: string;
  translated_text: string;
  translated_html: string | null;
  created_at: string;
}

interface TranslationKey {
  blockId: number;
  targetLanguage: string;
  style: "literary" | "faithful";
  contextMode: "previous" | "none";
}

export function getTranslation({
  blockId,
  targetLanguage,
  style,
  contextMode,
}: TranslationKey): SavedTranslation | undefined {
  return db.prepare(`
    SELECT *
    FROM translations
    WHERE block_id = ?
      AND target_language = ?
      AND style = ?
      AND context_mode = ?
  `).get(
    blockId,
    targetLanguage,
    style,
    contextMode
  ) as SavedTranslation | undefined;
}


export function saveTranslation(
  options: TranslationKey,
  translatedText: string,
  translatedHtml: string | null = null
): SavedTranslation {
  db.prepare(`
    INSERT INTO translations (
      block_id,
      target_language,
      style,
      context_mode,
      translated_text,
      translated_html
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (
      block_id,
      target_language,
      style,
      context_mode
    )
    DO UPDATE SET
      translated_text = excluded.translated_text,
      translated_html = excluded.translated_html,
      created_at = CURRENT_TIMESTAMP
  `).run(
    options.blockId,
    options.targetLanguage,
    options.style,
    options.contextMode,
    translatedText,
    translatedHtml
  );

  const saved = getTranslation(options);

  if (!saved) {
    throw new Error(
      "Failed to retrieve saved translation"
    );
  }

  return saved;
}


export function getOriginalBlock(blockId: number) {
  return db.prepare(`
    SELECT id, text, html
    FROM content_blocks
    WHERE id = ?
  `).get(blockId) as
    | {
        id: number;
        text: string;
        html: string;
      }
    | undefined;
}

export interface ChapterBlock {
  id: number;
  type: "heading" | "paragraph",
  text: string;
  html: string;
  position: number;
}

export function getChapterBlocks(
  bookId: number,
  chapterId: string
): ChapterBlock[] | null {
  const chapter = db.prepare(`
    SELECT id
    FROM chapters
    WHERE book_id = ? AND original_id = ?
  `).get(bookId, chapterId) as
    | { id: number }
    | undefined;

  if (!chapter) return null;

  return db.prepare(`
    SELECT id, type, text, html, position
    FROM content_blocks
    WHERE chapter_id = ?
      AND type IN ('heading', 'paragraph')
      AND TRIM(text) != ''
    ORDER BY position
  `).all(chapter.id) as ChapterBlock[];
}

export function getChapterTranslations(
  blockIds: number[],
  settings: TranslationKey
): Map<number, string> {
  const translations = new Map<number, string>();

  for (const blockId of blockIds) {
    const saved = getTranslation({
      blockId,
      targetLanguage: settings.targetLanguage,
      style: settings.style,
      contextMode: settings.contextMode,
    });

    if (saved) {
      translations.set(blockId, saved.translated_text);
    }
  }
  
  return translations;
}


export interface ChapterTranslation {
  blockId: number;
  translatedText: string;
}

export function getSavedChapterTranslations(
  bookId: number,
  chapterId: string,
  settings: TranslationKey
): ChapterTranslation[] | null {
  const blocks = getChapterBlocks(bookId, chapterId);

  if (!blocks) {
    return null;
  }

  const saved = getChapterTranslations(
    blocks.map((block) => block.id),
    settings
  );

  return blocks.flatMap((block) => {
    const translatedText = saved.get(block.id);

    return translatedText === undefined
      ? []
      : [{
          blockId: block.id,
          translatedText,
        }];
  });
}


export function getFormattedChapterTranslations(
  blockIds: number[],
  settings: TranslationKey
): Map<number, string> {
  const translations = new Map<number, string>();

  for (const blockId of blockIds) {
    const saved = getTranslation({
      blockId,
      targetLanguage: settings.targetLanguage,
      style: settings.style,
      contextMode: settings.contextMode,
    });

    if (
      saved &&
      saved.translated_html !== null
    ) {
      translations.set(
        blockId,
        saved.translated_text
      );
    }
  }

  return translations;
}

