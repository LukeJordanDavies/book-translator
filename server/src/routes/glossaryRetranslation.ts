import { Router } from "express";

import type {
  TranslationOptions,
} from "../services/translationService.js";

import {
  glossaryRetranslationService,
  GlossaryRetranslationError,
} from "../services/glossaryRetranslationService.js";

const router = Router();

const SUPPORTED_LANGUAGES = new Set([
  "English",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Japanese",
]);

function parseId(
  value: unknown
): number | null {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isSafeInteger(numberValue)
    ? numberValue
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
    typeof candidate.targetLanguage ===
      "string" &&
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

function handleError(
  error: unknown,
  res: import("express").Response
): void {
  if (
    error instanceof GlossaryRetranslationError
  ) {
    res.status(error.statusCode).json({
      error: error.message,
    });
    return;
  }

  console.error(
    "Glossary retranslation error:",
    error
  );

  res.status(500).json({
    error: "Glossary operation failed",
  });
}

// GET /api/glossary-retranslation/:bookId/candidates
router.get<{ bookId: string }>(
  "/:bookId/candidates",
  (req, res) => {
    const bookId = parseId(
      req.params.bookId
    );

    const entryId = parseId(
      req.query.entryId
    );

    const settings: unknown = {
      targetLanguage:
        req.query.targetLanguage,
      style: req.query.style,
      contextMode: req.query.contextMode,
    };

    if (
      bookId === null ||
      entryId === null ||
      !isSettings(settings)
    ) {
      res.status(400).json({
        error: "Invalid review parameters",
      });
      return;
    }

    try {
      const result =
        glossaryRetranslationService.getCandidates(
          bookId,
          entryId,
          settings
        );

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }
);

// POST /api/glossary-retranslation/:bookId/retranslate
router.post<{ bookId: string }>(
  "/:bookId/retranslate",
  async (req, res) => {
    const bookId = parseId(
      req.params.bookId
    );

    const body: unknown = req.body;

    if (
      bookId === null ||
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      res.status(400).json({
        error: "Invalid retranslation request",
      });
      return;
    }

    const input =
      body as Record<string, unknown>;

    const entryId =
      typeof input.entryId === "number" &&
      Number.isSafeInteger(input.entryId) &&
      input.entryId > 0
        ? input.entryId
        : null;

    if (
      entryId === null ||
      !isSettings(input.settings) ||
      !Array.isArray(input.blockIds)
    ) {
      res.status(400).json({
        error: "Invalid retranslation parameters",
      });
      return;
    }

    try {
      const result =
        await glossaryRetranslationService
          .retranslateSelected(
            bookId,
            entryId,
            input.settings,
            input.blockIds
          );

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }
);

export default router;
