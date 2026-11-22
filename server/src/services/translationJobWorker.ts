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

// Tracks workers active in this Node.js process.
const activeWorkers = new Set<number>();

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
  jobId: number
): Promise<void> {
  try {
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
  if (activeWorkers.has(jobId)) {
    return false;
  }

  const job =
    translationJobRepository.getById(jobId);

  if (!job || job.status !== "running") {
    return false;
  }

  activeWorkers.add(jobId);

  // Run independently of the HTTP response.
  void processJob(jobId);

  return true;
}
