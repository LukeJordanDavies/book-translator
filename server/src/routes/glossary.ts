import { Router } from "express";

import {
  glossaryRepository,
  type GlossaryCategory,
  type SaveGlossaryEntryInput,
} from "../database/glossaryRepository.js";

const router = Router({
  mergeParams: true,
});

const SUPPORTED_LANGUAGES = new Set([
  "English",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Japanese",
]);

const CATEGORIES = new Set<GlossaryCategory>([
  "character",
  "place",
  "term",
]);

function parseId(
  value: string | undefined
): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id)
    ? id
    : null;
}

// GET /api/books/:bookId/glossary
router.get<{ bookId: string }>("/", (req, res) => {
  const bookId = parseId(req.params.bookId);
  const targetLanguage =
    req.query.targetLanguage;

  if (bookId === null) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  if (
    typeof targetLanguage !== "string" ||
    !SUPPORTED_LANGUAGES.has(targetLanguage)
  ) {
    res.status(400).json({
      error: "Invalid target language",
    });
    return;
  }

  try {
    if (!glossaryRepository.bookExists(bookId)) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    const entries = glossaryRepository.list(
      bookId,
      targetLanguage
    );

    res.json({ entries });
  } catch (error) {
    console.error(
      "Failed to load glossary:",
      error
    );

    res.status(500).json({
      error: "Failed to load glossary",
    });
  }
});

// POST /api/books/:bookId/glossary
// Create or update a glossary entry.
router.post<{ bookId: string }>("/", (req, res) => {
  const bookId = parseId(req.params.bookId);

  if (bookId === null) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  const {
    targetLanguage,
    sourceTerm,
    translatedTerm,
    category = "term",
    notes = "",
  } = req.body ?? {};

  if (
    typeof targetLanguage !== "string" ||
    !SUPPORTED_LANGUAGES.has(targetLanguage)
  ) {
    res.status(400).json({
      error: "Invalid target language",
    });
    return;
  }

  if (
    typeof sourceTerm !== "string" ||
    !sourceTerm.trim() ||
    sourceTerm.trim().length > 120
  ) {
    res.status(400).json({
      error:
        "Source term must be 1–120 characters",
    });
    return;
  }

  if (
    typeof translatedTerm !== "string" ||
    !translatedTerm.trim() ||
    translatedTerm.trim().length > 120
  ) {
    res.status(400).json({
      error:
        "Translated term must be 1–120 characters",
    });
    return;
  }

  if (!CATEGORIES.has(category)) {
    res.status(400).json({
      error: "Invalid glossary category",
    });
    return;
  }

  if (
    typeof notes !== "string" ||
    notes.length > 300
  ) {
    res.status(400).json({
      error:
        "Notes must be at most 300 characters",
    });
    return;
  }

  const input: SaveGlossaryEntryInput = {
    bookId,
    targetLanguage,
    sourceTerm: sourceTerm.trim(),
    translatedTerm: translatedTerm.trim(),
    category,
    notes: notes.trim(),
  };

  try {
    if (!glossaryRepository.bookExists(bookId)) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    const entry = glossaryRepository.save(input);

    res.json({ entry });
  } catch (error) {
    console.error(
      "Failed to save glossary entry:",
      error
    );

    res.status(500).json({
      error: "Failed to save glossary entry",
    });
  }
});

// DELETE /api/books/:bookId/glossary/:entryId
router.delete<{ bookId: string; entryId: string; }>("/:entryId", (req, res) => {
  const bookId = parseId(req.params.bookId);
  const entryId = parseId(req.params.entryId);

  if (bookId === null || entryId === null) {
    res.status(400).json({
      error: "Invalid book or entry ID",
    });
    return;
  }

  try {
    const entry = glossaryRepository.getById(
      entryId
    );

    if (!entry || entry.bookId !== bookId) {
      res.status(404).json({
        error: "Glossary entry not found",
      });
      return;
    }

    glossaryRepository.remove(
      bookId,
      entryId
    );

    res.status(204).send();
  } catch (error) {
    console.error(
      "Failed to delete glossary entry:",
      error
    );

    res.status(500).json({
      error: "Failed to delete glossary entry",
    });
  }
});

export default router;
