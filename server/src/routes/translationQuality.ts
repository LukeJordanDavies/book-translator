import { Router } from "express";

import type {
  TranslationOptions,
} from "../services/translationService.js";

import {
  getTranslationQualityReport,
  QualityReportError,
} from "../services/translationQualityService.js";

const router = Router();

const SUPPORTED_LANGUAGES = new Set([
  "English",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Japanese",
]);

function parseId(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id)
    ? id
    : null;
}

function isSettings(
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
    typeof candidate.targetLanguage === "string" &&
    SUPPORTED_LANGUAGES.has(
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

// GET /api/translation-quality/:bookId
router.get<{ bookId: string }>(
  "/:bookId",
  (req, res) => {
    const bookId = parseId(
      req.params.bookId
    );

    const settings: unknown = {
      targetLanguage:
        req.query.targetLanguage,
      style: req.query.style,
      contextMode: req.query.contextMode,
    };

    if (
      bookId === null ||
      !isSettings(settings)
    ) {
      res.status(400).json({
        error:
          "Invalid book ID or translation settings"
      });
      return;
    }

    try {
      const report =
        getTranslationQualityReport(
          bookId,
          settings
        );

      res.json(report);
    } catch (error) {
      if (error instanceof QualityReportError) {
        res.status(error.statusCode).json({
          error: error.message,
        });
        return;
      }

      console.error(
        "Translation quality check failed:",
        error
      );

      res.status(500).json({
        error:
          "Failed to generate translation quality report"
      });
    }
  }
);

export default router;
