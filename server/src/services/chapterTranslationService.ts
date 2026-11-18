import {
  getChapterBlocks,
  getChapterTranslations,
  saveTranslation,
} from "../database/translationRepository.js";

import {
  translateText,
  type TranslationOptions,
} from "./translationService.js";

const BATCH_SIZE = 3;

export async function translateChapterBatch(
  bookId: number,
  chapterId: string,
  settings: TranslationOptions
) {
  const blocks = getChapterBlocks(bookId, chapterId);

  if (!blocks) {
    throw new Error("CHAPTER_NOT_FOUND");
  }

  const key = {
    blockId: 0,
    targetLanguage: settings.targetLanguage,
    style: settings.style,
    contextMode: settings.contextMode,
  };

  const saved = getChapterTranslations(
    blocks.map((block) => block.id),
    key
  );

  const pending = blocks
    .filter((block) => !saved.has(block.id))
    .slice(0, BATCH_SIZE);

  for (const block of pending) {
    // Retrieve up to 2,000 characters of preceding
    // narrative text for translation continuity.
    const previousText = blocks
      .filter((item) => item.position < block.position)
      .map((item) => saved.get(item.id) ?? item.text)
      .join("\n\n")
      .slice(-2000);

    const previousContext =
      settings.contextMode === "previous"
        ? previousText
        : undefined;

    const translatedText = await translateText({
      text: block.text,
      settings,
      previousContext,
    });

    saveTranslation(
      {
        blockId: block.id,
        targetLanguage: settings.targetLanguage,
        style: settings.style,
        contextMode: settings.contextMode,
      },
      translatedText
    );

    saved.set(block.id, translatedText);
  }

  const completed = blocks.filter((block) =>
    saved.has(block.id)
  ).length;

  return {
    total: blocks.length,
    completed,
    remaining: blocks.length - completed,
    finished: completed === blocks.length,
  };
}
