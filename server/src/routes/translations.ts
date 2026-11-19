import { Router } from "express";

import {
  translateFormattedText,
  type TranslationOptions,
} from "../services/translationService.js";

import {
  getTranslation,
  saveTranslation,
  getOriginalBlock,
} from "../database/translationRepository.js";

import { getSavedChapterTranslations } from "../database/translationRepository.js";

import { translateChapterBatch } from "../services/chapterTranslationService.js";

const router = Router();

const allowedLanguages = [
  "French",
  "Spanish",
  "German",
  "Italian",
  "English",
  "Japanese",
];

function validSettings(value: unknown): value is TranslationOptions {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Record<string, unknown>;

  return (
    typeof settings.targetLanguage === "string" &&
    allowedLanguages.includes(settings.targetLanguage) &&
    (settings.style === "literary" || settings.style === "faithful") &&
    (settings.contextMode === "previous" || settings.contextMode === "none")
  );
}

router.get("/chapter/:bookId/:chapterId", (req, res) => {
  const bookId = Number(req.params.bookId);
  const chapterId = req.params.chapterId;

  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  if (!chapterId || chapterId.length > 500) {
    res.status(400).json({
      error: "Invalid chapter ID",
    });
    return;
  }

  const settings = {
    targetLanguage: req.query.targetLanguage,
    style: req.query.style,
    contextMode: req.query.contextMode,
  };

  if (!validSettings(settings)) {
    res.status(400).json({
      error: "Invalid translation settings",
    });
    return;
  }

  try {
    const translations = getSavedChapterTranslations(bookId, chapterId, {
      blockId: 0,
      ...settings,
    });

    if (translations === null) {
      res.status(404).json({
        error: "Chapter not found",
      });
      return;
    }

    res.json({ translations });
  } catch (error) {
    console.error("Failed to retrieve chapter translations:", error);

    res.status(500).json({
      error: "Failed to load chapter translations",
    });
  }
});

// Retrieve an existing translation.
router.get("/:blockId", (req, res) => {
  const blockId = Number(req.params.blockId);

  if (!Number.isSafeInteger(blockId) || blockId <= 0) {
    res.status(400).json({
      error: "Invalid block ID",
    });
    return;
  }

  const settings = {
    targetLanguage: req.query.targetLanguage,
    style: req.query.style,
    contextMode: req.query.contextMode,
  };

  if (!validSettings(settings)) {
    res.status(400).json({
      error: "Invalid translation settings",
    });
    return;
  }

  try {
    const translation = getTranslation({
      blockId,
      ...settings,
    });

    res.json({
      translation: translation ?? null,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to retrieve translation",
    });
  }
});

// Translate and save a paragraph.
router.post("/", async (req, res) => {
  const { blockId, settings } = req.body ?? {};

  if (!Number.isSafeInteger(blockId) || blockId <= 0) {
    res.status(400).json({
      error: "Invalid block ID",
    });
    return;
  }

  if (!validSettings(settings)) {
    res.status(400).json({
      error: "Invalid translation settings",
    });
    return;
  }

  try {
    const block = getOriginalBlock(blockId);

    if (!block) {
      res.status(404).json({
        error: "Paragraph not found",
      });
      return;
    }

    if (!block.text.trim() || block.text.length > 3000) {
      res.status(400).json({
        error: "Paragraph must contain 1–3000 characters",
      });
      return;
    }

    const key = {
      blockId,
      targetLanguage: settings.targetLanguage,
      style: settings.style,
      contextMode: settings.contextMode,
    };

    const existing = getTranslation(key);

    if (existing && existing.translated_html !== null) {
      res.json({
        translatedText: existing.translated_text,
        cached: true,
      });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({
        error: "OpenAI API key is not configured",
      });
      return;
    }

    const result = await translateFormattedText(block.html, settings);

    saveTranslation(key, result.translatedText, result.translatedHtml);

    res.json({
      translatedText: result.translatedText,
      cached: false,
    });
  } catch (error) {
    console.error("Translation failed:", error);

    res.status(502).json({
      error: "Translation failed. Check server logs.",
    });
  }
});

router.post("/chapter", async (req, res) => {
  const { bookId, chapterId, settings } = req.body ?? {};

  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  if (typeof chapterId !== "string" || !chapterId.trim()) {
    res.status(400).json({
      error: "Invalid chapter ID",
    });
    return;
  }

  if (!validSettings(settings)) {
    res.status(400).json({
      error: "Invalid translation settings",
    });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({
      error: "OpenAI API key is not configured",
    });
    return;
  }

  try {
    const progress = await translateChapterBatch(bookId, chapterId, settings);

    res.json(progress);
  } catch (error) {
    if (error instanceof Error && error.message === "CHAPTER_NOT_FOUND") {
      res.status(404).json({
        error: "Chapter not found",
      });
      return;
    }

    console.error("Chapter translation failed:", error);

    res.status(502).json({
      error: "Chapter translation failed. Saved paragraphs can be resumed.",
    });
  }
});

export default router;
