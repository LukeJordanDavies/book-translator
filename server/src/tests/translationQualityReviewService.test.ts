import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import {
  createQualityReviewService,
} from "../services/translationQualityReviewService.js";

import {
  QualityReportError,
} from "../services/translationQualityService.js";

const settings = {
  targetLanguage: "French",
  style: "literary" as const,
  contextMode: "previous" as const,
};

function createTestDatabase() {
  const connection = new Database(":memory:");

  connection.pragma("foreign_keys = ON");

  connection.exec(`
    CREATE TABLE books (
      id INTEGER PRIMARY KEY
    );

    CREATE TABLE chapters (
      id INTEGER PRIMARY KEY,
      book_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,

      FOREIGN KEY (book_id)
        REFERENCES books(id)
        ON DELETE CASCADE
    );

    CREATE TABLE content_blocks (
      id INTEGER PRIMARY KEY,
      chapter_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      position INTEGER NOT NULL,
      text TEXT NOT NULL,
      html TEXT NOT NULL,

      FOREIGN KEY (chapter_id)
        REFERENCES chapters(id)
        ON DELETE CASCADE
    );

    CREATE TABLE translations (
      id INTEGER PRIMARY KEY,
      block_id INTEGER NOT NULL,
      target_language TEXT NOT NULL,
      style TEXT NOT NULL,
      context_mode TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      translated_html TEXT,

      FOREIGN KEY (block_id)
        REFERENCES content_blocks(id)
        ON DELETE CASCADE
    );

    CREATE TABLE translation_glossary (
      id INTEGER PRIMARY KEY,
      book_id INTEGER NOT NULL,
      target_language TEXT NOT NULL,
      source_term TEXT NOT NULL,
      translated_term TEXT NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (book_id)
        REFERENCES books(id)
        ON DELETE CASCADE
    );

    CREATE TABLE translation_quality_reviews (
      issue_id TEXT PRIMARY KEY,
      book_id INTEGER NOT NULL,
      block_id INTEGER NOT NULL,
      target_language TEXT NOT NULL,
      style TEXT NOT NULL,
      context_mode TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (book_id)
        REFERENCES books(id)
        ON DELETE CASCADE,

      FOREIGN KEY (block_id)
        REFERENCES content_blocks(id)
        ON DELETE CASCADE
    );

    INSERT INTO books VALUES (15);

    INSERT INTO chapters
      (id, book_id, title, position)
    VALUES
      (5, 15, 'Chapter One', 1);

    INSERT INTO content_blocks
      (id, chapter_id, type, position, text, html)
    VALUES (
      101,
      5,
      'paragraph',
      1,
      'Mira entered The Silver Vale under the moonlight.',
      'Mira entered The Silver Vale under the moonlight.'
    );

    INSERT INTO translations (
      id,
      block_id,
      target_language,
      style,
      context_mode,
      translated_text,
      translated_html
    )
    VALUES (
      1,
      101,
      'French',
      'literary',
      'previous',
      'Mira entra dans la Vallée Argentée au clair de lune.',
      'Mira entra dans la Vallée Argentée au clair de lune.'
    );

    INSERT INTO translation_glossary (
      id,
      book_id,
      target_language,
      source_term,
      translated_term,
      category,
      notes,
      created_at,
      updated_at
    )
    VALUES (
      7,
      15,
      'French',
      'The Silver Vale',
      'Le Val Argenté',
      'place',
      '',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  `);

  return connection;
}

test("persists a reviewed warning", () => {
  const connection = createTestDatabase();

  try {
    const service = createQualityReviewService(
      connection
    );

    const before = service.getReviewedReport(
      15,
      settings
    );

    assert.equal(before.issues.length, 1);
    assert.equal(before.issues[0].reviewed, false);

    const issueId = before.issues[0].issueId;

    service.setReviewed(
      15,
      settings,
      issueId,
      true
    );

    // A new service instance can retrieve the
    // review from the same SQLite database.
    const reopened =
      createQualityReviewService(connection)
        .getReviewedReport(15, settings);

    assert.equal(reopened.issues[0].reviewed, true);
    assert.equal(reopened.reviewedVisibleIssues, 1);
    assert.equal(reopened.unreviewedVisibleIssues, 0);
  } finally {
    connection.close();
  }
});

test("allows a reviewed warning to be reopened", () => {
  const connection = createTestDatabase();

  try {
    const service = createQualityReviewService(
      connection
    );

    const issueId =
      service.getReviewedReport(
        15,
        settings
      ).issues[0].issueId;

    service.setReviewed(
      15,
      settings,
      issueId,
      true
    );

    service.setReviewed(
      15,
      settings,
      issueId,
      false
    );

    const report = service.getReviewedReport(
      15,
      settings
    );

    assert.equal(report.issues[0].reviewed, false);
    assert.equal(report.reviewedVisibleIssues, 0);
  } finally {
    connection.close();
  }
});

test("requires a new review after translation changes", () => {
  const connection = createTestDatabase();

  try {
    const service = createQualityReviewService(
      connection
    );

    const originalIssue =
      service.getReviewedReport(
        15,
        settings
      ).issues[0];

    service.setReviewed(
      15,
      settings,
      originalIssue.issueId,
      true
    );

    connection.prepare(`
      UPDATE translations
      SET
        translated_text = ?,
        translated_html = ?
      WHERE block_id = 101
    `).run(
      "Mira découvrit la Vallée Argentée.",
      "Mira découvrit la Vallée Argentée."
    );

    const updated = service.getReviewedReport(
      15,
      settings
    );

    assert.equal(updated.issues.length, 1);

    assert.notEqual(
      updated.issues[0].issueId,
      originalIssue.issueId
    );

    assert.equal(
      updated.issues[0].reviewed,
      false
    );
  } finally {
    connection.close();
  }
});

test("requires a new review after glossary changes", () => {
  const connection = createTestDatabase();

  try {
    const service = createQualityReviewService(
      connection
    );

    const originalIssue =
      service.getReviewedReport(
        15,
        settings
      ).issues[0];

    service.setReviewed(
      15,
      settings,
      originalIssue.issueId,
      true
    );

    connection.prepare(`
      UPDATE translation_glossary
      SET translated_term = ?
      WHERE id = 7
    `).run("Le Val d'Argent");

    const updated = service.getReviewedReport(
      15,
      settings
    );

    assert.equal(updated.issues.length, 1);

    assert.notEqual(
      updated.issues[0].issueId,
      originalIssue.issueId
    );

    assert.equal(
      updated.issues[0].reviewed,
      false
    );
  } finally {
    connection.close();
  }
});

test("rejects stale warning identifiers", () => {
  const connection = createTestDatabase();

  try {
    const service = createQualityReviewService(
      connection
    );

    assert.throws(
      () => service.setReviewed(
        15,
        settings,
        "a".repeat(64),
        true
      ),
      (error: unknown) =>
        error instanceof QualityReportError &&
        error.statusCode === 409
    );
  } finally {
    connection.close();
  }
});

test("removes review records when a book is deleted", () => {
  const connection = createTestDatabase();

  try {
    const service = createQualityReviewService(
      connection
    );

    const issueId =
      service.getReviewedReport(
        15,
        settings
      ).issues[0].issueId;

    service.setReviewed(
      15,
      settings,
      issueId,
      true
    );

    connection.prepare(`
      DELETE FROM books WHERE id = 15
    `).run();

    const remaining = connection.prepare(`
      SELECT COUNT(*) AS count
      FROM translation_quality_reviews
    `).get() as { count: number };

    assert.equal(remaining.count, 0);
  } finally {
    connection.close();
  }
});
