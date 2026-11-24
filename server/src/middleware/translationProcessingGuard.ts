import type {
  RequestHandler,
} from "express";

import db from "../database/database.js";

import type {
  TranslationOptions,
} from "../services/translationService.js";

import {
  acquireTranslationLock,
} from "../services/translationProcessingLock.js";

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

  const settings =
    value as Record<string, unknown>;

  return (
    typeof settings.targetLanguage === "string" &&
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

function getBookIdForBlock(
  blockId: number
): number | null {
  const row = db.prepare(`
    SELECT c.book_id AS bookId
    FROM content_blocks cb
    JOIN chapters c
      ON c.id = cb.chapter_id
    WHERE cb.id = ?
  `).get(blockId) as
    | { bookId: number }
    | undefined;

  return row?.bookId ?? null;
}

export const translationProcessingGuard:
  RequestHandler = (req, res, next) => {
    // Leave existing GET endpoints unchanged.
    if (req.method !== "POST") {
      next();
      return;
    }

    // Only guard the translation-producing routes.
    if (
      req.path !== "/" &&
      req.path !== "/chapter"
    ) {
      next();
      return;
    }

    const settings: unknown =
      req.body?.settings;

    if (!isSettings(settings)) {
      // Let the existing route return its
      // normal validation error.
      next();
      return;
    }

    let bookId: number | null = null;

    try {
      if (req.path === "/chapter") {
        const value: unknown = req.body?.bookId;

        if (
          typeof value === "number" &&
          Number.isSafeInteger(value) &&
          value > 0
        ) {
          bookId = value;
        }
      } else {
        const value: unknown = req.body?.blockId;

        if (
          typeof value === "number" &&
          Number.isSafeInteger(value) &&
          value > 0
        ) {
          bookId = getBookIdForBlock(value);
        }
      }
    } catch (error) {
      next(error);
      return;
    }

    if (bookId === null) {
      // Invalid IDs remain the responsibility
      // of the existing translation route.
      next();
      return;
    }

    const releaseLock = acquireTranslationLock(
      bookId,
      settings
    );

    if (!releaseLock) {
      res.status(409).json({
        error:
          "This book is already being translated " +
          "using the selected settings. " +
          "Pause or finish that operation first.",
      });
      return;
    }

    // Release when Express finishes or closes
    // the HTTP response.
    res.once("finish", releaseLock);
    res.once("close", releaseLock);

    next();
  };
