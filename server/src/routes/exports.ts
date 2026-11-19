import { Router } from "express";

import {
  validateBookForExport,
} from "../services/epubExportService.js";

import type {
  TranslationOptions,
} from "../services/translationService.js";

const router = Router();

const languages = new Set([
  "French",
  "Spanish",
  "German",
  "Italian",
  "English",
  "Japanese",
]);

function isValidSettings(
  value: unknown
): value is TranslationOptions {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Record<string, unknown>;

  return (
    typeof settings.targetLanguage === "string" &&
    languages.has(settings.targetLanguage) &&
    (settings.style === "literary" ||
      settings.style === "faithful") &&
    (settings.contextMode === "previous" ||
      settings.contextMode === "none")
  );
}

router.post("/validate", (req, res) => {
  const { bookId, settings } = req.body ?? {};

  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  if (!isValidSettings(settings)) {
    res.status(400).json({
      error: "Invalid translation settings",
    });
    return;
  }

  try {
    const validation = validateBookForExport(
      bookId,
      settings
    );

    res.json(validation);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "BOOK_NOT_FOUND"
    ) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    console.error("Export validation failed:", error);

    res.status(500).json({
      error: "Failed to validate EPUB export",
    });
  }
});

export default router;
