import { Router } from "express";

import {
  getBookTranslationProgress,
  getChapterOriginalId,
} from "../services/bookTranslationService.js";

import {
  translateChapterBatch,
} from "../services/chapterTranslationService.js";

import type {
  TranslationOptions,
} from "../services/translationService.js";

const router = Router();

const SUPPORTED_LANGUAGES = new Set([
  "English",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Japanese",
]);

// Prevent overlapping full-book batches for the
// same book and translation settings.
const activeBatches = new Set<string>();

function isValidSettings(
  value: unknown
): value is TranslationOptions {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const settings = value as
    Record<string, unknown>;

  return (
    typeof settings.targetLanguage === "string" &&
    SUPPORTED_LANGUAGES.has(
      settings.targetLanguage
    ) &&
    (
      settings.style === "literary" ||
      settings.style === "faithful"
    ) &&
    (
      settings.contextMode === "previous" ||
      settings.contextMode === "none"
    )
  );
}

function parseBookId(
  value: string
): number | null {
  const id = Number(value);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return id;
}

// GET /api/book-translation/:bookId/progress
router.get("/:bookId/progress", (req, res) => {
  const bookId = parseBookId(
    req.params.bookId
  );

  if (bookId === null) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  const settings = {
    targetLanguage: req.query.targetLanguage,
    style: req.query.style,
    contextMode: req.query.contextMode,
  };

  if (!isValidSettings(settings)) {
    res.status(400).json({
      error: "Invalid translation settings",
    });
    return;
  }

  try {
    const progress = getBookTranslationProgress(
      bookId,
      settings
    );

    if (!progress) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    res.json(progress);
  } catch (error) {
    console.error(
      "Failed to retrieve book progress:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve translation progress",
    });
  }
});

// POST /api/book-translation/:bookId/next
router.post("/:bookId/next", async (req, res) => {
  const bookId = parseBookId(
    req.params.bookId
  );

  if (bookId === null) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  const settings: unknown =
    req.body?.settings;

  if (!isValidSettings(settings)) {
    res.status(400).json({
      error: "Invalid translation settings",
    });
    return;
  }

  const lockKey = JSON.stringify([
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
  ]);

  if (activeBatches.has(lockKey)) {
    res.status(409).json({
      error:
        "A translation batch is already running for this book and settings",
    });
    return;
  }

  activeBatches.add(lockKey);

  try {
    const before = getBookTranslationProgress(
      bookId,
      settings
    );

    if (!before) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    if (before.totalBlocks === 0) {
      res.status(422).json({
        error:
          "This book contains no supported text blocks to translate",
      });
      return;
    }

    // Return normally if the book is complete.
    if (before.finished) {
      res.json({
        processedChapterId: null,
        batch: null,
        progress: before,
      });
      return;
    }

    const chapterId = before.nextChapterId;

    if (chapterId === null) {
      throw new Error(
        "No unfinished chapter could be found"
      );
    }

    // Reuse the existing chapter translation
    // service, including its three-block batch
    // limit, context handling, retry logic,
    // and SQLite persistence.
    const originalChapterId = getChapterOriginalId(
    bookId,
    chapterId
    );

    if (originalChapterId === null) {
    throw new Error(
        `Original chapter ID not found for chapter ${chapterId}`
    );
    }

    const batch = await translateChapterBatch(
    bookId,
    originalChapterId,
    settings
    );

    // Read the actual saved progress again.
    const after = getBookTranslationProgress(
      bookId,
      settings
    );

    if (!after) {
      throw new Error(
        "Book disappeared during translation"
      );
    }

    // This also protects the future React loop
    // from requesting the same batch forever.
    if (
      after.translatedBlocks <=
      before.translatedBlocks
    ) {
      res.status(409).json({
        error:
          "The batch saved no new translations. Check the chapter translation service.",
        progress: after,
      });
      return;
    }

    res.json({
      processedChapterId: chapterId,
      batch,
      progress: after,
    });
  } catch (error) {
    console.error(
      "Full-book translation batch failed:",
      error
    );

    res.status(502).json({
      error:
        "The translation batch failed. Previously saved translations are preserved.",
    });
  } finally {
    activeBatches.delete(lockKey);
  }
});

export default router;
