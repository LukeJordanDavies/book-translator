import {
  translationJobRepository,
  type TranslationJob,
} from "../database/translationJobRepository.js";

import {
  getBookTranslationProgress,
  getChapterOriginalId,
} from "./bookTranslationService.js";

import {
  translateChapterBatch,
} from "./chapterTranslationService.js";

import type {
  TranslationOptions,
} from "./translationService.js";

import {
  acquireTranslationLock,
} from "./translationProcessingLock.js";

import {
  getTranslationBatchLimit,
} from "./translationBatchLimit.js";

// Tracks workers active in this Node.js process.
const activeWorkers = new Set<number>();

export function isTranslationJobActive(
  jobId: number
): boolean {
  return activeWorkers.has(jobId);
}

function settingsFromJob(
  job: TranslationJob
): TranslationOptions {
  return {
    targetLanguage: job.targetLanguage,
    style: job.style,
    contextMode: job.contextMode,
  };
}

async function processJob(
  jobId: number,
  releaseLock: () => void
): Promise<void> {

  let batchesThisRun = 0;

  try {
    const maxBatches = getTranslationBatchLimit(
      process.env.TRANSLATION_MAX_BATCHES_PER_RUN
    );

    console.log(
      `Translation job ${jobId} started ` +
      `(limit: ${maxBatches} batches)`
    );

    while (true) {
      // Read the current status before each batch.
      const job =
        translationJobRepository.getById(jobId);

      if (!job || job.status !== "running") {
        return;
      }

      const settings = settingsFromJob(job);

      const before = getBookTranslationProgress(
        job.bookId,
        settings
      );

      if (!before) {
        throw new Error("Book not found");
      }

      if (before.totalBlocks === 0) {
        throw new Error(
          "Book contains no supported text blocks"
        );
      }

      if (before.finished) {
        translationJobRepository.setStatus(
          jobId,
          "completed"
        );

        console.log(
          `Translation job ${jobId} completed`
        );

        return;
      }

      // Pause automatically when this run reaches
      // the configured number of batches.
      if (batchesThisRun >= maxBatches) {
        const message =
          `Automatic pause: ${maxBatches} ` +
          `translation batches completed. ` +
          `Select Resume to continue.`;

        translationJobRepository.setStatus(
          jobId,
          "paused",
          message
        );

        console.log(
          `Translation job ${jobId}: ${message}`
        );

        return;
      }

      const chapterId = before.nextChapterId;

      if (chapterId === null) {
        throw new Error(
          "No unfinished chapter found"
        );
      }

      // The existing chapter translation service
      // expects the original string chapter ID.
      const originalChapterId =
        getChapterOriginalId(
          job.bookId,
          chapterId
        );

      if (originalChapterId === null) {
        throw new Error(
          `Original ID missing for chapter ${chapterId}`
        );
      }

      await translateChapterBatch(
        job.bookId,
        originalChapterId,
        settings
      );

      batchesThisRun++;

      const after = getBookTranslationProgress(
        job.bookId,
        settings
      );

      if (!after) {
        throw new Error(
          "Book no longer exists"
        );
      }

      if (
        after.translatedBlocks <=
        before.translatedBlocks
      ) {
        throw new Error(
          "Translation batch saved no new blocks"
        );
      }

      console.log(
        `Job ${jobId}: ${after.translatedBlocks}/` +
        `${after.totalBlocks} blocks translated`
      );


      if (after.finished) {
        translationJobRepository.setStatus(
          jobId,
          "completed"
        );

        console.log(
          `Translation job ${jobId} completed`
        );

        return;
      }

      // Loop back and check the status again.
      // A pause request prevents the next batch.
    }
  } catch (error) {
    console.error(
      `Translation job ${jobId} failed:`,
      error
    );

    const job =
      translationJobRepository.getById(jobId);

    // Do not overwrite a requested pause.
    if (job?.status === "running") {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown translation error";

      translationJobRepository.setStatus(
        jobId,
        "failed",
        message.slice(0, 500)
      );
    }
  } finally {
    activeWorkers.delete(jobId);
    releaseLock();

    // Handles a quick Pause -> Resume that occurs
    // while the previous worker is finishing.
    const job =
      translationJobRepository.getById(jobId);

    if (job?.status === "running") {
      launchTranslationJob(jobId);
    }
  }
}


export function launchTranslationJob(
  jobId: number
): boolean {
  // Prevent two workers for the same job.
  if (activeWorkers.has(jobId)) {
    return false;
  }

  const job =
    translationJobRepository.getById(jobId);

  if (!job || job.status !== "running") {
    return false;
  }

  const settings = settingsFromJob(job);

  // Prevent another translation operation
  // from processing the same book/settings.
  const releaseLock = acquireTranslationLock(
    job.bookId,
    settings
  );

  if (!releaseLock) {
    return false;
  }

  activeWorkers.add(jobId);

  // The worker continues independently of
  // the HTTP request or browser connection.
  void processJob(jobId, releaseLock);

  return true;
}
