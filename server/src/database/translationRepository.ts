import db from "./database.js";

export interface SavedTranslation {
  id: number;
  block_id: number;
  target_language: string;
  style: string;
  context_mode: string;
  translated_text: string;
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
  translatedText: string
): SavedTranslation {
  db.prepare(`
    INSERT INTO translations (
      block_id,
      target_language,
      style,
      context_mode,
      translated_text
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (
      block_id,
      target_language,
      style,
      context_mode
    )
    DO UPDATE SET
      translated_text = excluded.translated_text,
      created_at = CURRENT_TIMESTAMP
  `).run(
    options.blockId,
    options.targetLanguage,
    options.style,
    options.contextMode,
    translatedText
  );

  const saved = getTranslation(options);

  if (!saved) {
    throw new Error("Failed to retrieve saved translation");
  }

  return saved;
}

export function getOriginalBlock(blockId: number) {
  return db.prepare(`
    SELECT id, text
    FROM content_blocks
    WHERE id = ?
  `).get(blockId) as
    | { id: number; text: string }
    | undefined;
}


export interface ChapterBlock {
  id: number;
  text: string;
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
    SELECT id, text, position
    FROM content_blocks
    WHERE chapter_id = ?
      AND type = 'paragraph'
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


