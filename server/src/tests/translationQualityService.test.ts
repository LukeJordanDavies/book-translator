import test from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import {
  getBookQualityReport,
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
      position INTEGER NOT NULL
    );

    CREATE TABLE content_blocks (
      id INTEGER PRIMARY KEY,
      chapter_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      position INTEGER NOT NULL,
      text TEXT NOT NULL,
      html TEXT NOT NULL
    );

    CREATE TABLE translations (
      id INTEGER PRIMARY KEY,
      block_id INTEGER NOT NULL,
      target_language TEXT NOT NULL,
      style TEXT NOT NULL,
      context_mode TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      translated_html TEXT
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
      updated_at TEXT NOT NULL
    );

    INSERT INTO books VALUES (15);

    INSERT INTO chapters
      (id, book_id, title, position)
    VALUES
      (5, 15, 'Chapter One', 1);

    INSERT INTO content_blocks
      (id, chapter_id, type, position, text, html)
    VALUES
      (
        101, 5, 'paragraph', 1,
        'Mira entered The Silver Vale.',
        'Mira entered <em>The Silver Vale</em>.'
      ),
      (
        102, 5, 'paragraph', 2,
        'The road continued toward the mountains.',
        'The road continued toward the mountains.'
      ),
      (
        103, 5, 'paragraph', 3,
        'The distant forest was filled with ancient trees.',
        'The distant forest was filled with ancient trees.'
      );

    INSERT INTO translations
      (
        id, block_id, target_language,
        style, context_mode,
        translated_text, translated_html
      )
    VALUES
      (
        1, 101, 'French', 'literary', 'previous',
        'Mira entra dans la Vallée Argentée.',
        'Mira entra dans <em>la Vallée Argentée</em>.'
      ),
      (
        2, 103, 'French', 'literary', 'previous',
        'The distant forest was filled with ancient trees.',
        'The distant forest was filled with ancient trees.'
      );

    INSERT INTO translation_glossary
      (
        id, book_id, target_language,
        source_term, translated_term,
        category, notes,
        created_at, updated_at
      )
    VALUES
      (
        7, 15, 'French',
        'The Silver Vale', 'Le Val Argenté',
        'place', '',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
  `);

  return connection;
}

test("reports missing saved translations", () => {
  const connection = createTestDatabase();

  try {
    const report = getBookQualityReport(
      connection,
      15,
      settings
    );

    assert.equal(report.totalBlocks, 3);
    assert.equal(report.translatedBlocks, 2);
    assert.equal(report.missingBlocks, 1);

    assert.ok(
      report.issues.some(
        (issue) =>
          issue.blockId === 102 &&
          issue.kind === "missing_translation"
      )
    );
  } finally {
    connection.close();
  }
});

test("detects unchanged source text", () => {
  const connection = createTestDatabase();

  try {
    const report = getBookQualityReport(
      connection,
      15,
      settings
    );

    assert.ok(
      report.issues.some(
        (issue) =>
          issue.blockId === 103 &&
          issue.kind === "untranslated_source"
      )
    );
  } finally {
    connection.close();
  }
});

test("detects a possible glossary inconsistency", () => {
  const connection = createTestDatabase();

  try {
    const report = getBookQualityReport(
      connection,
      15,
      settings
    );

    assert.ok(
      report.issues.some(
        (issue) =>
          issue.blockId === 101 &&
          issue.kind === "glossary_inconsistency"
      )
    );
  } finally {
    connection.close();
  }
});

test("detects missing XHTML formatting", () => {
  const connection = createTestDatabase();

  try {
    connection.prepare(`
      UPDATE translations
      SET translated_html =
        'Mira entra dans la Vallée Argentée.'
      WHERE block_id = 101
    `).run();

    const report = getBookQualityReport(
      connection,
      15,
      settings
    );

    assert.ok(
      report.issues.some(
        (issue) =>
          issue.blockId === 101 &&
          issue.kind === "formatting_difference"
      )
    );
  } finally {
    connection.close();
  }
});

test("does not flag correct glossary terminology", () => {
  const connection = createTestDatabase();

  try {
    connection.prepare(`
      UPDATE translations
      SET
        translated_text =
          'Mira entra dans le Val Argenté.',
        translated_html =
          'Mira entra dans <em>le Val Argenté</em>.'
      WHERE block_id = 101
    `).run();

    const report = getBookQualityReport(
      connection,
      15,
      settings
    );

    assert.equal(
      report.issues.filter(
        (issue) =>
          issue.blockId === 101 &&
          issue.kind === "glossary_inconsistency"
      ).length,
      0
    );
  } finally {
    connection.close();
  }
});

test("rejects a nonexistent book", () => {
  const connection = createTestDatabase();

  try {
    assert.throws(
      () =>
        getBookQualityReport(
          connection,
          999,
          settings
        ),
      (error: unknown) =>
        error instanceof QualityReportError &&
        error.statusCode === 404
    );
  } finally {
    connection.close();
  }
});
