import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import {
  createGlossaryRepository,
  type SaveGlossaryEntryInput,
} from "../database/glossaryRepository.js";

const example: SaveGlossaryEntryInput = {
  bookId: 1,
  targetLanguage: "French",
  sourceTerm: "The Silver Vale",
  translatedTerm: "La Vallée Argentée",
  category: "place",
  notes: "Use consistently throughout the book.",
};

function createTestRepository() {
  const connection = new Database(":memory:");

  connection.pragma("foreign_keys = ON");

  connection.exec(`
    CREATE TABLE books (
      id INTEGER PRIMARY KEY
    );

    INSERT INTO books (id) VALUES (1), (2);

    CREATE TABLE translation_glossary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      target_language TEXT NOT NULL,
      source_term TEXT NOT NULL COLLATE NOCASE,
      translated_term TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'term'
        CHECK (
          category IN (
            'character',
            'place',
            'term'
          )
        ),
      notes TEXT NOT NULL DEFAULT '',
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
        source_term
      )
    );
  `);

  return {
    connection,
    repository: createGlossaryRepository(
      connection
    ),
  };
}

test("saves and retrieves a glossary entry", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    const saved = repository.save(example);
    const entries = repository.list(1, "French");

    assert.ok(saved.id > 0);
    assert.equal(entries.length, 1);
    assert.equal(
      entries[0].sourceTerm,
      "The Silver Vale"
    );
    assert.equal(
      entries[0].translatedTerm,
      "La Vallée Argentée"
    );
    assert.equal(entries[0].category, "place");
  } finally {
    connection.close();
  }
});

test("updates an existing term without duplication", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    const first = repository.save(example);

    const updated = repository.save({
      ...example,
      sourceTerm: "the silver vale",
      translatedTerm: "Le Val Argenté",
    });

    assert.equal(updated.id, first.id);
    assert.equal(
      updated.translatedTerm,
      "Le Val Argenté"
    );
    assert.equal(
      repository.list(1, "French").length,
      1
    );
  } finally {
    connection.close();
  }
});

test("keeps target languages separate", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    repository.save(example);

    repository.save({
      ...example,
      targetLanguage: "German",
      translatedTerm: "Das Silbertal",
    });

    const french = repository.list(1, "French");
    const german = repository.list(1, "German");

    assert.equal(french.length, 1);
    assert.equal(german.length, 1);

    assert.equal(
      french[0].translatedTerm,
      "La Vallée Argentée"
    );
    assert.equal(
      german[0].translatedTerm,
      "Das Silbertal"
    );
  } finally {
    connection.close();
  }
});

test("only deletes entries belonging to the book", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    const saved = repository.save(example);

    assert.equal(
      repository.remove(2, saved.id),
      false
    );

    assert.ok(repository.getById(saved.id));

    assert.equal(
      repository.remove(1, saved.id),
      true
    );

    assert.equal(
      repository.getById(saved.id),
      null
    );
  } finally {
    connection.close();
  }
});

test("deletes glossary entries with their book", () => {
  const { connection, repository } =
    createTestRepository();

  try {
    repository.save(example);

    connection.prepare(`
      DELETE FROM books
      WHERE id = ?
    `).run(1);

    assert.deepEqual(
      repository.list(1, "French"),
      []
    );
  } finally {
    connection.close();
  }
});
