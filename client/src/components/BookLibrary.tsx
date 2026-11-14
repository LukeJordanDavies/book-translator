import { useEffect, useState } from "react";

interface LibraryBook {
  id: number;
  title: string;
  author: string;
  filename: string;
  uploaded_at: string;
  chapter_count: number;
}

interface BookLibraryProps {
  onSelectBook: (bookId: number) => void;
  onBookDeleted: (bookId: number) => void;
  refreshKey: number;
}

function BookLibrary({
  onSelectBook,
  onBookDeleted,
  refreshKey,
}: BookLibraryProps) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadBooks() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/books");

        if (!response.ok) {
          throw new Error("Failed to load library");
        }

        const data: LibraryBook[] = await response.json();

        if (!cancelled) {
          setBooks(data);
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error ? error.message : "Something went wrong",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBooks();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleDelete(book: LibraryBook) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${book.title}"?`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/books/${book.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete book");
      }

      setBooks((previous) => previous.filter((item) => item.id !== book.id));

      onBookDeleted(book.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <section>
      <h2>Your Library</h2>

      {loading && <p>Loading books...</p>}
      {error && <p>{error}</p>}

      {!loading && !error && books.length === 0 && (
        <p>No books uploaded yet.</p>
      )}

      <ul>
        {books.map((book) => (
          <li key={book.id}>
            <button type="button" onClick={() => onSelectBook(book.id)}>
              {book.title}
            </button>

            <p>Author: {book.author}</p>
            <p>Sections: {book.chapter_count}</p>

            <button type="button" onClick={() => handleDelete(book)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default BookLibrary;
