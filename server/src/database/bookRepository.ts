import db from "./database.js";
import type { ExtractedBook } from "../epub/extractEpub.js";

const insertBook = db.prepare(`
  INSERT INTO books (title, author, filename)
  VALUES (?, ?, ?)
`);

const insertBookFile = db.prepare(`
  INSERT INTO book_files (book_id, epub_data)
  VALUES (?, ?)
`);

const insertChapter = db.prepare(`
  INSERT INTO chapters (
    book_id,
    original_id,
    title,
    position,
    source_path,
    original_xhtml
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertBlock = db.prepare(`
  INSERT INTO content_blocks (
    chapter_id,
    original_id,
    type,
    tag_name,
    text,
    html,
    source_path,
    element_path,
    position
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export const saveBook = db.transaction(
  (book: ExtractedBook, filename: string, epubBuffer: Buffer): number => {
    const bookResult = insertBook.run(
      book.title,
      book.author,
      filename
    );

    const bookId = Number(bookResult.lastInsertRowid);
    insertBookFile.run(bookId, epubBuffer);

    book.chapters.forEach((chapter, chapterIndex) => {
      const chapterResult = insertChapter.run(
        bookId,
        chapter.id,
        chapter.title,
        chapterIndex,
        chapter.sourcePath,
        chapter.originalXhtml
      );

      const chapterId = Number(
        chapterResult.lastInsertRowid
      );

      chapter.blocks.forEach((block, blockIndex) => {
        insertBlock.run(
          chapterId,
          block.id,
          block.type,
          block.tagName,
          block.text,
          block.html,
          block.sourcePath,
          block.elementPath,
          blockIndex
        );
      });
    });

    return bookId;
  }
);


export interface LibraryBook {
  id: number;
  title: string;
  author: string;
  filename: string;
  uploaded_at: string;
  chapter_count: number;
}

export function getAllBooks(): LibraryBook[] {
  const statement = db.prepare(`
    SELECT
      books.id,
      books.title,
      books.author,
      books.filename,
      books.uploaded_at,
      COUNT(chapters.id) AS chapter_count
    FROM books
    LEFT JOIN chapters
      ON chapters.book_id = books.id
    GROUP BY books.id
    ORDER BY books.uploaded_at DESC, books.id DESC
  `);

  return statement.all() as LibraryBook[];
}


interface BookRow {
  id: number;
  title: string;
  author: string;
  filename: string;
  uploaded_at: string;
}

interface ChapterRow {
  id: number;
  original_id: string;
  title: string;
  source_path: string;
  original_xhtml: string;
}

interface BlockRow {
  id: number;
  original_id: string;
  type: "heading" | "paragraph";
  tag_name: string;
  text: string;
  html: string;
  source_path: string;
  element_path: string;
}

export function getBookById(bookId: number) {
  const book = db.prepare(`
    SELECT id, title, author, filename, uploaded_at
    FROM books
    WHERE id = ?
  `).get(bookId) as BookRow | undefined;

  if (!book) return null;

  const chapters = db.prepare(`
    SELECT id, original_id, title,
           source_path, original_xhtml
    FROM chapters
    WHERE book_id = ?
    ORDER BY position
  `).all(bookId) as ChapterRow[];

  const blocksStatement = db.prepare(`
    SELECT id, original_id, type, tag_name, text,
           html, source_path, element_path
    FROM content_blocks
    WHERE chapter_id = ?
    ORDER BY position
  `);

  return {
    ...book,
    chapters: chapters.map((chapter) => {
      const blocks = blocksStatement.all(
        chapter.id
      ) as BlockRow[];

      return {
        id: chapter.original_id,
        title: chapter.title,
        sourcePath: chapter.source_path,
        originalXhtml: chapter.original_xhtml,
        blocks: blocks.map((block) => ({
          id: block.original_id,
          databaseId: block.id,
          type: block.type,
          tagName: block.tag_name,
          text: block.text,
          html: block.html,
          sourcePath: block.source_path,
          elementPath: block.element_path,
        })),
      };
    }),
  };
}


export function deleteBook(bookId: number): boolean {
  const statement = db.prepare(`
    DELETE FROM books
    WHERE id = ?
  `);

  const result = statement.run(bookId);

  return result.changes > 0;
}

