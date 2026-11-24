import { Router } from "express";

import {
  translationJobRepository,
  type TranslationJob,
} from "../database/translationJobRepository.js";

import {
  getBookTranslationProgress,
} from "../services/bookTranslationService.js";

import {
  launchTranslationJob,
  isTranslationJobActive,
} from "../services/translationJobWorker.js";

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

  const settings =
    value as Record<string, unknown>;

  return (
    typeof settings.targetLanguage === "string" &&
    SUPPORTED_LANGUAGES.has(settings.targetLanguage) &&
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

function parseId(
  value: string
): number | null {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function getJobSnapshot(
  jobId: number
) {
  const job =
    translationJobRepository.getById(jobId);

  if (!job) {
    return null;
  }

  const settings: TranslationOptions = {
    targetLanguage: job.targetLanguage,
    style: job.style,
    contextMode: job.contextMode,
  };

  const progress = getBookTranslationProgress(
    job.bookId,
    settings
  );

  return { job, progress };
}

// POST /api/translation-jobs
// Create or start a translation job.
router.post("/", (req, res) => {
  const bookId: unknown = req.body?.bookId;
  const settings: unknown = req.body?.settings;

  if (
    typeof bookId !== "number" ||
    !Number.isSafeInteger(bookId) ||
    bookId <= 0
  ) {
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

    if (progress.totalBlocks === 0) {
      res.status(422).json({
        error:
          "Book has no supported text blocks",
      });
      return;
    }

    const job =
      translationJobRepository.getOrCreate(
        bookId,
        settings
      );

    if (progress.finished) {
      translationJobRepository.setStatus(
        job.id,
        "completed"
      );
    } else if (
      !(
        job.status === "running" &&
        isTranslationJobActive(job.id)
      )
    ) {
      translationJobRepository.setStatus(
        job.id,
        "running"
      );

      const launched =
        launchTranslationJob(job.id);

      if (
        !launched &&
        !isTranslationJobActive(job.id)
      ) {
        translationJobRepository.setStatus(
          job.id,
          "paused",
          "Another translation operation is active " +
          "for this book and settings."
        );

        res.status(409).json({
          error:
            "Another translation operation is already " +
            "processing this book and settings.",
        });
        return;
      }
    }

    res.json(getJobSnapshot(job.id));
  } catch (error) {
    console.error(
      "Failed to start translation job:",
      error
    );

    res.status(500).json({
      error: "Failed to start translation job",
    });
  }
});

// GET /api/translation-jobs/by-book/:bookId
router.get("/by-book/:bookId", (req, res) => {
  const bookId = parseId(req.params.bookId);

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

    const job =
      translationJobRepository.getByBookAndSettings(
        bookId,
        settings
      );

    res.json({
      job,
      progress,
    });
  } catch (error) {
    console.error(
      "Failed to retrieve translation job:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve translation job"
    });
  }
});

// GET /api/translation-jobs/:jobId
router.get("/:jobId", (req, res) => {
  const jobId = parseId(req.params.jobId);

  if (jobId === null) {
    res.status(400).json({
      error: "Invalid job ID",
    });
    return;
  }

  try {
    const snapshot = getJobSnapshot(jobId);

    if (!snapshot) {
      res.status(404).json({
        error: "Translation job not found",
      });
      return;
    }

    res.json(snapshot);
  } catch (error) {
    console.error(
      "Failed to retrieve translation job:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve translation job",
    });
  }
});

// POST /api/translation-jobs/:jobId/pause
router.post("/:jobId/pause", (req, res) => {
  const jobId = parseId(req.params.jobId);

  if (jobId === null) {
    res.status(400).json({
      error: "Invalid job ID",
    });
    return;
  }

  try {
    const job =
      translationJobRepository.getById(jobId);

    if (!job) {
      res.status(404).json({
        error: "Translation job not found",
      });
      return;
    }

    if (
      job.status === "running" ||
      job.status === "pending"
    ) {
      translationJobRepository.setStatus(
        jobId,
        "paused"
      );
    }

    res.json(getJobSnapshot(jobId));
  } catch (error) {
    console.error(
      "Failed to pause translation job:",
      error
    );

    res.status(500).json({
      error: "Failed to pause translation job",
    });
  }
});

// POST /api/translation-jobs/:jobId/resume
router.post("/:jobId/resume", (req, res) => {
  const jobId = parseId(req.params.jobId);

  if (jobId === null) {
    res.status(400).json({
      error: "Invalid job ID",
    });
    return;
  }

  try {
    const job =
      translationJobRepository.getById(jobId);

    if (!job) {
      res.status(404).json({
        error: "Translation job not found",
      });
      return;
    }

    const progress = getBookTranslationProgress(
      job.bookId,
      {
        targetLanguage: job.targetLanguage,
        style: job.style,
        contextMode: job.contextMode,
      }
    );

    if (!progress) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    if (progress.finished) {
      translationJobRepository.setStatus(
        jobId,
        "completed"
      );
    } else {
      translationJobRepository.setStatus(
        jobId,
        "running"
      );

      const launched =
        launchTranslationJob(jobId);

      // An active worker for this same job is fine:
      // it may still be finishing a batch after
      // a quick Pause -> Resume.
      if (
        !launched &&
        !isTranslationJobActive(jobId)
      ) {
        translationJobRepository.setStatus(
          jobId,
          "paused",
          "Another translation operation is active " +
          "for this book and settings."
        );

        res.status(409).json({
          error:
            "Another translation operation is already " +
            "processing this book and settings.",
        });
        return;
      }
    }

    res.json(getJobSnapshot(jobId));
  } catch (error) {
    console.error(
      "Failed to resume translation job:",
      error
    );

    res.status(500).json({
      error: "Failed to resume translation job",
    });
  }
});

export default router;
