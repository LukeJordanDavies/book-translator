import db from "./database.js";
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
export const saveBook = db.transaction((book, filename, epubBuffer) => {
    const bookResult = insertBook.run(book.title, book.author, filename);
    const bookId = Number(bookResult.lastInsertRowid);
    insertBookFile.run(bookId, epubBuffer);
    book.chapters.forEach((chapter, chapterIndex) => {
        const chapterResult = insertChapter.run(bookId, chapter.id, chapter.title, chapterIndex, chapter.sourcePath, chapter.originalXhtml);
        const chapterId = Number(chapterResult.lastInsertRowid);
        chapter.blocks.forEach((block, blockIndex) => {
            insertBlock.run(chapterId, block.id, block.type, block.tagName, block.text, block.html, block.sourcePath, block.elementPath, blockIndex);
        });
    });
    return bookId;
});
export function getAllBooks() {
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
    return statement.all();
}
export function getBookById(bookId) {
    const book = db.prepare(`
    SELECT id, title, author, filename, uploaded_at
    FROM books
    WHERE id = ?
  `).get(bookId);
    if (!book)
        return null;
    const chapters = db.prepare(`
    SELECT id, original_id, title,
           source_path, original_xhtml
    FROM chapters
    WHERE book_id = ?
    ORDER BY position
  `).all(bookId);
    const blocksStatement = db.prepare(`
    SELECT original_id, type, tag_name, text,
           html, source_path, element_path
    FROM content_blocks
    WHERE chapter_id = ?
    ORDER BY position
  `);
    return {
        ...book,
        chapters: chapters.map((chapter) => {
            const blocks = blocksStatement.all(chapter.id);
            return {
                id: chapter.original_id,
                title: chapter.title,
                sourcePath: chapter.source_path,
                originalXhtml: chapter.original_xhtml,
                blocks: blocks.map((block) => ({
                    id: block.original_id,
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
export function deleteBook(bookId) {
    const statement = db.prepare(`
    DELETE FROM books
    WHERE id = ?
  `);
    const result = statement.run(bookId);
    return result.changes > 0;
}
