import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import {
  createGlossaryRetranslationService,
  GlossaryRetranslationError,
} from "../services/glossaryRetranslationService.js";

import {
  acquireTranslationLock,
  isTranslationLocked,
} from "../services/translationProcessingLock.js";

const settings = {
  targetLanguage: "French",
  style: "literary" as const,
  contextMode: "previous" as const,
};

function createTestDatabase() {
  const connection = new Database(":memory:");

  connection.exec(`
    CREATE TABLE chapters (
      id INTEGER PRIMARY KEY,
      book_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE TABLE content_blocks (
      id INTEGER PRIMARY KEY,
      chapter_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      type TEXT NOT NULL,
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
      translated_html TEXT,
      UNIQUE (
        block_id,
        target_language,
        style,
        context_mode
      )
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

    INSERT INTO chapters
      (id, book_id, title, position)
    VALUES
      (5, 15, 'Chapter One', 1);

    INSERT INTO content_blocks
      (id, chapter_id, position, type, text, html)
    VALUES
      (
        101, 5, 1, 'paragraph',
        'Mira entered The Silver Vale.',
        'Mira entered The Silver Vale.'
      ),
      (
        102, 5, 2, 'paragraph',
        'Mira reached the castle.',
        'Mira reached the castle.'
      );

    INSERT INTO translations
      (
        id, block_id, target_language,
        style, context_mode,
        translated_text, translated_html
      )
    VALUES
      (
        1, 101, 'French',
        'literary', 'previous',
        'Mira entra dans la Vallée Argentée.',
        'Mira entra dans la Vallée Argentée.'
      ),
      (
        2, 102, 'French',
        'literary', 'previous',
        'Mira atteignit le château.',
        'Mira atteignit le château.'
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

test("finds matching saved translations", () => {
  const connection = createTestDatabase();

  try {
    const service =
      createGlossaryRetranslationService(
        connection
      );

    const result = service.getCandidates(
      15,
      7,
      settings
    );

    assert.equal(result.totalCandidates, 1);
    assert.equal(
      result.candidates[0].blockId,
      101
    );

    assert.equal(
      result.entry.translatedTerm,
      "Le Val Argenté"
    );
  } finally {
    connection.close();
  }
});

test("updates only a selected cached translation", async () => {
  const connection = createTestDatabase();

  let calls = 0;

  try {
    const service =
      createGlossaryRetranslationService(
        connection,
        async () => {
          calls++;

          return {
            translatedText:
              "Mira entra dans le Val Argenté.",
            translatedHtml:
              "Mira entra dans le Val Argenté.",
          };
        }
      );

    const result = await service.retranslateSelected(
      15,
      7,
      settings,
      [101]
    );

    assert.deepEqual(result.updatedIds, [101]);
    assert.equal(calls, 1);

    const rows = connection.prepare(`
      SELECT
        block_id AS blockId,
        translated_text AS text
      FROM translations
      ORDER BY block_id
    `).all() as Array<{
      blockId: number;
      text: string;
    }>;

    assert.equal(
      rows[0].text,
      "Mira entra dans le Val Argenté."
    );

    assert.equal(
      rows[1].text,
      "Mira atteignit le château."
    );
  } finally {
    connection.close();
  }
});

test("rejects unrelated blocks before translation", async () => {
  const connection = createTestDatabase();

  let calls = 0;

  try {
    const service =
      createGlossaryRetranslationService(
        connection,
        async () => {
          calls++;

          return {
            translatedText: "Test",
            translatedHtml: "Test",
          };
        }
      );

    await assert.rejects(
      service.retranslateSelected(
        15,
        7,
        settings,
        [102]
      ),
      (error: unknown) =>
        error instanceof
          GlossaryRetranslationError &&
        error.statusCode === 400
    );

    assert.equal(calls, 0);
  } finally {
    connection.close();
  }
});

test("preserves previous text if translation fails", async () => {
  const connection = createTestDatabase();

  try {
    const service =
      createGlossaryRetranslationService(
        connection,
        async () => {
          throw new Error("Test API failure");
        }
      );

    const result = await service.retranslateSelected(
      15,
      7,
      settings,
      [101]
    );

    assert.deepEqual(result.updatedIds, []);
    assert.equal(result.failures.length, 1);

    const saved = connection.prepare(`
      SELECT translated_text AS text
      FROM translations
      WHERE block_id = 101
    `).get() as { text: string };

    assert.equal(
      saved.text,
      "Mira entra dans la Vallée Argentée."
    );

    assert.equal(
      isTranslationLocked(15, settings),
      false
    );
  } finally {
    connection.close();
  }
});

test("rejects retranslation when the book is locked", async () => {
  const connection = createTestDatabase();

  const release = acquireTranslationLock(
    15,
    settings
  );

  assert.ok(release);

  try {
    const service =
      createGlossaryRetranslationService(
        connection
      );

    await assert.rejects(
      service.retranslateSelected(
        15,
        7,
        settings,
        [101]
      ),
      (error: unknown) =>
        error instanceof
          GlossaryRetranslationError &&
        error.statusCode === 409
    );
  } finally {
    release();
    connection.close();
  }
});
