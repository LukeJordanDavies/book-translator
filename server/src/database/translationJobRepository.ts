import db from "./database.js";

import type {
  TranslationOptions,
} from "../services/translationService.js";

export type TranslationJobStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface TranslationJob {
  id: number;
  bookId: number;
  targetLanguage: string;
  style: TranslationOptions["style"];
  contextMode: TranslationOptions["contextMode"];
  status: TranslationJobStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createJobRepository(
  connection: typeof db
) {
  function getById(
    jobId: number
  ): TranslationJob | null {
    const row = connection.prepare(`
      SELECT
        id,
        book_id AS bookId,
        target_language AS targetLanguage,
        style,
        context_mode AS contextMode,
        status,
        last_error AS lastError,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM book_translation_jobs
      WHERE id = ?
    `).get(jobId) as TranslationJob | undefined;

    return row ?? null;
  }

  function getOrCreate(
    bookId: number,
    settings: TranslationOptions
  ): TranslationJob {
    connection.prepare(`
      INSERT INTO book_translation_jobs (
        book_id,
        target_language,
        style,
        context_mode
      )
      VALUES (?, ?, ?, ?)

      ON CONFLICT (
        book_id,
        target_language,
        style,
        context_mode
      ) DO NOTHING
    `).run(
      bookId,
      settings.targetLanguage,
      settings.style,
      settings.contextMode
    );

    const row = connection.prepare(`
      SELECT id
      FROM book_translation_jobs
      WHERE book_id = ?
        AND target_language = ?
        AND style = ?
        AND context_mode = ?
    `).get(
      bookId,
      settings.targetLanguage,
      settings.style,
      settings.contextMode
    ) as { id: number } | undefined;

    if (!row) {
      throw new Error(
        "Failed to create or find translation job"
      );
    }

    const job = getById(row.id);

    if (!job) {
      throw new Error(
        "Translation job disappeared"
      );
    }

    return job;
  }

  function setStatus(
    jobId: number,
    status: TranslationJobStatus,
    lastError: string | null = null
  ): void {
    connection.prepare(`
      UPDATE book_translation_jobs
      SET
        status = ?,
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      status,
      lastError,
      jobId
    );
  }

  function recoverInterruptedJobs(): number {
    const result = connection.prepare(`
      UPDATE book_translation_jobs
      SET
        status = 'paused',
        last_error =
          'Server restarted during translation. Resume when ready.',
        updated_at = CURRENT_TIMESTAMP
      WHERE status = 'running'
    `).run();

    return result.changes;
  }

  return {
    getById,
    getOrCreate,
    setStatus,
    recoverInterruptedJobs,
  };
}

// Repository used by the application.
export const translationJobRepository =
  createJobRepository(db);
