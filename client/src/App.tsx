import { useState } from "react";
import BookUploader from "./components/BookUploader";
import BookLibrary from "./components/BookLibrary";

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
  blocks: ContentBlock[];
}

interface Book {
  id: number;
  title: string;
  author: string;
  chapters: Chapter[];
}

function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [loadingBook, setLoadingBook] = useState(false);
  const [error, setError] = useState("");

  function handleBookUploaded() {
    setRefreshKey((previous) => previous + 1);
  }

  function handleBookDeleted(bookId: number) {
    if (selectedBook?.id === bookId) {
      setSelectedBook(null);
      setSelectedChapter(null);
    }
  }

  async function handleSelectBook(bookId: number) {
    setLoadingBook(true);
    setError("");
    setSelectedBook(null);
    setSelectedChapter(null);

    try {
      const response = await fetch(`/api/books/${bookId}`);

      if (!response.ok) {
        throw new Error("Failed to load book");
      }

      const book: Book = await response.json();
      setSelectedBook(book);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoadingBook(false);
    }
  }

  return (
    <main>
      <h1>Book Translator</h1>

      <BookUploader onBookUploaded={handleBookUploaded} />

      <BookLibrary onSelectBook={handleSelectBook} onBookDeleted={handleBookDeleted} refreshKey={refreshKey} />

      {loadingBook && <p>Loading book...</p>}
      {error && <p>{error}</p>}

      {selectedBook && (
        <section>
          <h2>{selectedBook.title}</h2>
          <p>By {selectedBook.author}</p>

          <h3>Contents</h3>

          <ul>
            {selectedBook.chapters.map((chapter, index) => (
              <li key={`${chapter.id}-${index}`}>
                <button type="button" onClick={() => setSelectedChapter(index)}>
                  {chapter.title}
                </button>
              </li>
            ))}
          </ul>

          {selectedChapter !== null && (
            <article>
              <h3>{selectedBook.chapters[selectedChapter].title}</h3>

              {selectedBook.chapters[selectedChapter].blocks.map((block) =>
                block.type === "heading" ? (
                  <h3 key={block.id}>{block.text}</h3>
                ) : (
                  <p key={block.id}>{block.text}</p>
                ),
              )}
            </article>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
