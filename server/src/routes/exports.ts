import { Router } from "express";

import {
  validateBookForExport,
} from "../services/epubExportService.js";

import type {
  TranslationOptions,
} from "../services/translationService.js";

import {
  generateTranslatedEpub,
} from "../services/epubExportService.js";

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


router.post("/download", async (req, res) => {
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
    const epubBuffer = await generateTranslatedEpub(
      bookId,
      settings
    );

    res.setHeader(
      "Content-Type",
      "application/epub+zip"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="translated-book-${bookId}.epub"`
    );

    res.setHeader(
      "Content-Length",
      epubBuffer.length
    );

    res.send(epubBuffer);
  } catch (error) {
    console.error("EPUB export failed:", error);

    if (
      error instanceof Error &&
      error.message === "BOOK_NOT_FOUND"
    ) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message.startsWith("EXPORT_INCOMPLETE")
    ) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    if (
    error instanceof Error &&
    error.message.startsWith(
        "EPUB_VALIDATION_FAILED"
    )
    ) {
    res.status(422).json({
        error:
        "The translated EPUB failed structural validation. Check the server logs for details.",
    });
    return;
    }

    res.status(500).json({
      error: "Failed to generate translated EPUB",
    });
  }
});

