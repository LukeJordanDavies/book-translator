import { useState, type ChangeEvent } from "react";

interface ContentBlock {
  id: string;
  type: "heading" | "paragraph";
  tagName: string;
  text: string;
  html: string;
  sourcePath: string;
  elementPath: string;
}

interface Chapter {
  id: string;
  title: string;
  sourcePath: string;
  originalXhtml: string;
  blocks: ContentBlock[];
}

interface Book {
  title: string;
  author: string;
  chapters: Chapter[];
}

function BookUploader() {
  const [book, setBook] = useState<Book | null>(null);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage("Extracting EPUB...");
    setBook(null);
    setSelectedChapter(null);

    const formData = new FormData();
    formData.append("book", file);

    try {
      const response = await fetch("/api/books/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setBook(data.book);
      setMessage("EPUB extracted successfully!");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <section>
      <h2>Upload a Book</h2>

      <input
        type="file"
        accept=".epub"
        onChange={handleUpload}
        disabled={uploading}
      />

      <p>{message}</p>

      {book && (
        <div>
          <h2>{book.title}</h2>
          <p>Author: {book.author}</p>
          <p>Sections: {book.chapters.length}</p>

          <h3>Contents</h3>

          <ul>
            {book.chapters.map((chapter, index) => (
              <li key={chapter.id}>
                <button type="button" onClick={() => setSelectedChapter(index)}>
                  {chapter.title}
                </button>
              </li>
            ))}
          </ul>

          {selectedChapter !== null && (
            <article>
              <div>
                {book.chapters[selectedChapter].blocks.map((block) =>
                  block.type === "heading" ? (
                    <h3 key={block.id}>{block.text}</h3>
                  ) : (
                    <p key={block.id}>{block.text}</p>
                  ),
                )}
              </div>
            </article>
          )}
        </div>
      )}
    </section>
  );
}

export default BookUploader;
