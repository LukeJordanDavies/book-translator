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

import {
  epubExportDiagnosticsService,
  getEpubIntegrityErrorResponse,
} from "../services/epubExportDiagnosticsService.js";

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


// POST /api/exports/reference-report
router.post(
  "/reference-report",
  async (req, res) => {
    const bookId: unknown =
      req.body?.bookId;

    const settings: unknown =
      req.body?.settings;

    const supportedLanguages = new Set([
      "English",
      "French",
      "Spanish",
      "German",
      "Italian",
      "Japanese",
    ]);

    function validSettings(
      value: unknown
    ): value is TranslationOptions {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        return false;
      }

      const candidate =
        value as Record<string, unknown>;

      return (
        typeof candidate.targetLanguage ===
          "string" &&
        supportedLanguages.has(
          candidate.targetLanguage
        ) &&
        (
          candidate.style === "literary" ||
          candidate.style === "faithful"
        ) &&
        (
          candidate.contextMode === "previous" ||
          candidate.contextMode === "none"
        )
      );
    }

    if (
      typeof bookId !== "number" ||
      !Number.isSafeInteger(bookId) ||
      bookId < 1 ||
      !validSettings(settings)
    ) {
      res.status(400).json({
        error:
          "Invalid book ID or translation settings",
      });
      return;
    }

    try {
      // Avoid reconstructing incomplete books.
      const completeness =
        await validateBookForExport(
          bookId,
          settings
        );

      if (!completeness.ready) {
        res.status(409).json({
          code: "EXPORT_INCOMPLETE",
          error:
            "Complete the missing translations " +
            "before inspecting the final EPUB.",
          status: completeness,
        });
        return;
      }

      const result =
        await epubExportDiagnosticsService
          .inspect(bookId, settings);

      // A reference-validation failure is
      // a reportable result, not a lost report.
      res.json(result);
    } catch (error) {
      console.error(
        "EPUB integrity inspection failed:",
        error
      );

      if (
        error instanceof Error &&
        error.message === "BOOK_NOT_FOUND"
      ) {
        res.status(404).json({
          error: "Book not found",
        });
        return;
      }

      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Could not inspect the EPUB",
      });
    }
  }
);


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

    const integrityError =
      getEpubIntegrityErrorResponse(error);

    if (integrityError) {
      res.status(422).json(integrityError);
      return;
    }

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

