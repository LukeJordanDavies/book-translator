import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import {
  createJobRepository,
} from "../database/translationJobRepository.js";

const settings = {
  targetLanguage: "French",
  style: "literary" as const,
  contextMode: "previous" as const,
};

function createTestRepository() {
  const connection = new Database(":memory:");

  connection.pragma("foreign_keys = ON");

  connection.exec(`
    CREATE TABLE books (
      id INTEGER PRIMARY KEY
    );

    INSERT INTO books (id) VALUES (1);

    CREATE TABLE book_translation_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      target_language TEXT NOT NULL,
      style TEXT NOT NULL,
      context_mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (book_id)
        REFERENCES books(id)
        ON DELETE CASCADE,

      UNIQUE (
        book_id,
        target_language,
        style,
        context_mode
      )
    );
  `);

  return {
    connection,
    repository: createJobRepository(
      connection
    ),
  };
}

test("creates a persistent translation job", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    const job = repository.getOrCreate(
      1,
      settings
    );

    assert.ok(job.id > 0);
    assert.equal(job.bookId, 1);
    assert.equal(job.targetLanguage, "French");
    assert.equal(job.status, "pending");

    const saved = repository.getById(job.id);

    assert.deepEqual(saved, job);
  } finally {
    connection.close();
  }
});

test("does not duplicate jobs with identical settings", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    const first = repository.getOrCreate(
      1,
      settings
    );

    const second = repository.getOrCreate(
      1,
      settings
    );

    assert.equal(first.id, second.id);
  } finally {
    connection.close();
  }
});

test("updates job status and records failures", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    const job = repository.getOrCreate(
      1,
      settings
    );

    repository.setStatus(job.id, "running");

    assert.equal(
      repository.getById(job.id)?.status,
      "running"
    );

    repository.setStatus(
      job.id,
      "failed",
      "Test translation error"
    );

    const updated = repository.getById(job.id);

    assert.equal(updated?.status, "failed");
    assert.equal(
      updated?.lastError,
      "Test translation error"
    );

    repository.setStatus(job.id, "running");

    assert.equal(
      repository.getById(job.id)?.lastError,
      null
    );
  } finally {
    connection.close();
  }
});

test("recovers running jobs after a restart", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    const running = repository.getOrCreate(
      1,
      settings
    );

    const completed = repository.getOrCreate(
      1,
      {
        ...settings,
        targetLanguage: "Spanish",
      }
    );

    repository.setStatus(
      running.id,
      "running"
    );

    repository.setStatus(
      completed.id,
      "completed"
    );

    const recovered =
      repository.recoverInterruptedJobs();

    assert.equal(recovered, 1);

    assert.equal(
      repository.getById(running.id)?.status,
      "paused"
    );

    assert.equal(
      repository.getById(completed.id)?.status,
      "completed"
    );
  } finally {
    connection.close();
  }
});


test("finds a job by book and translation settings", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    const original = repository.getOrCreate(
      1,
      settings
    );

    const found =
      repository.getByBookAndSettings(
        1,
        settings
      );

    assert.equal(found?.id, original.id);

    const differentLanguage =
      repository.getByBookAndSettings(
        1,
        {
          ...settings,
          targetLanguage: "German",
        }
      );

    assert.equal(differentLanguage, null);
  } finally {
    connection.close();
  }
});

