import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve("data");

// Create the data directory if it doesn't exist.
fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(
  dataDirectory,
  "book-translator.sqlite"
);

const db = new Database(databasePath);

// Enable foreign key constraints.
db.pragma("foreign_keys = ON");

// Enable write-ahead logging.
db.pragma("journal_mode = WAL");

// Create the database tables.
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    filename TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS book_files (
  book_id INTEGER PRIMARY KEY,
  epub_data BLOB NOT NULL,

  FOREIGN KEY (book_id)
    REFERENCES books(id)
    ON DELETE CASCADE
);

  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    original_id TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    source_path TEXT NOT NULL,
    original_xhtml TEXT NOT NULL,

    FOREIGN KEY (book_id)
      REFERENCES books(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS content_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL,
    original_id TEXT NOT NULL,
    type TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    text TEXT NOT NULL,
    html TEXT NOT NULL,
    source_path TEXT NOT NULL,
    element_path TEXT NOT NULL,
    position INTEGER NOT NULL,

    FOREIGN KEY (chapter_id)
      REFERENCES chapters(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL,
    target_language TEXT NOT NULL,
    style TEXT NOT NULL,
    context_mode TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (block_id)
      REFERENCES content_blocks(id)
      ON DELETE CASCADE,

    UNIQUE (
      block_id,
      target_language,
      style,
      context_mode
    )
  );

  CREATE INDEX IF NOT EXISTS idx_chapters_book
    ON chapters(book_id, position);

  CREATE INDEX IF NOT EXISTS idx_blocks_chapter
    ON content_blocks(chapter_id, position);
`);


const translationColumns = db
  .prepare("PRAGMA table_info(translations)")
  .all() as Array<{ name: string }>;

const hasTranslatedHtml = translationColumns.some(
  (column) => column.name === "translated_html"
);

if (!hasTranslatedHtml) {
  db.exec(`
    ALTER TABLE translations
    ADD COLUMN translated_html TEXT
  `);

  console.log(
    "Database updated: added translated_html column"
  );
}


db.exec(`
  CREATE TABLE IF NOT EXISTS book_translation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    book_id INTEGER NOT NULL,

    target_language TEXT NOT NULL,
    style TEXT NOT NULL,
    context_mode TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (
        status IN (
          'pending',
          'running',
          'paused',
          'completed',
          'failed'
        )
      ),

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

db.exec(`
  CREATE TABLE IF NOT EXISTS translation_glossary (
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

db.exec(`
  CREATE TABLE IF NOT EXISTS translation_quality_reviews (
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

  CREATE INDEX IF NOT EXISTS idx_quality_reviews_book
    ON translation_quality_reviews (
      book_id,
      target_language,
      style,
      context_mode
    );
`);


export default db;
