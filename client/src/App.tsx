import { useState } from "react";
import BookUploader from "./components/BookUploader";
import BookLibrary from "./components/BookLibrary";
import TranslationSettings from "./components/TranslationSettings";
import ParagraphTranslator from "./components/ParagraphTranslator";
import ChapterTranslator from "./components/ChapterTranslator";
import ChapterReader from "./components/ChapterReader";
import EpubExporter from "./components/EpubExporter";
import FullBookTranslator from "./components/FullBookTranslator";
import GlossaryEditor from "./components/GlossaryEditor";

import type { TranslationOptions } from "./components/TranslationSettings";

interface ContentBlock {
  id: string;
  databaseId: number;
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
  const [translationSettings, setTranslationSettings] =
    useState<TranslationOptions>({
      targetLanguage: "French",
      style: "literary",
      contextMode: "previous",
    });

  const [paragraphToTranslate, setParagraphToTranslate] = useState<{
    blockId: number;
    text: string;
  } | null>(null);

  const [translationRefreshKey, setTranslationRefreshKey] = useState(0);

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
    setParagraphToTranslate(null);

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

      <BookLibrary
        onSelectBook={handleSelectBook}
        onBookDeleted={handleBookDeleted}
        refreshKey={refreshKey}
      />

      {selectedBook && (
        <TranslationSettings
          settings={translationSettings}
          onChange={setTranslationSettings}
        />
      )}

      {selectedBook && (
        <GlossaryEditor
          key={`${selectedBook.id}-${translationSettings.targetLanguage}`}
          bookId={selectedBook.id}
          targetLanguage={
            translationSettings.targetLanguage
          }
        />
      )}

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
            <>
              <article>
                <h3>{selectedBook.chapters[selectedChapter].title}</h3>

                {selectedBook.chapters[selectedChapter].blocks.map((block) => (
                  <div key={block.id}>
                    {block.type === "heading" ? (
                      <h3>{block.text}</h3>
                    ) : (
                      <p>{block.text}</p>
                    )}

                    {block.type === "paragraph" && (
                      <button
                        type="button"
                        onClick={() =>
                          setParagraphToTranslate({
                            blockId: block.databaseId,
                            text: block.text,
                          })
                        }
                      >
                        Select for Translation
                      </button>
                    )}
                  </div>
                ))}
              </article>

              <ChapterTranslator
                key={`${selectedBook.id}-${selectedBook.chapters[selectedChapter].id}-${translationSettings.targetLanguage}-${translationSettings.style}-${translationSettings.contextMode}`}
                bookId={selectedBook.id}
                chapterId={selectedBook.chapters[selectedChapter].id}
                settings={translationSettings}
                onBatchCompleted={() =>
                  setTranslationRefreshKey((previous) => previous + 1)
                }
              />

              <ChapterReader
                bookId={selectedBook.id}
                chapterId={selectedBook.chapters[selectedChapter].id}
                chapterTitle={selectedBook.chapters[selectedChapter].title}
                blocks={selectedBook.chapters[selectedChapter].blocks}
                settings={translationSettings}
                refreshKey={translationRefreshKey}
              />
            </>
          )}
          
          {selectedBook && (
            <>
              <FullBookTranslator
                bookId={selectedBook.id}
                settings={translationSettings}
                onBatchCompleted={() => {
                  setTranslationRefreshKey(
                    (current) => current + 1
                  );
                }}
              />

              <EpubExporter
                bookId={selectedBook.id}
                settings={translationSettings}
              />
            </>
          )}

          {paragraphToTranslate && (
            <ParagraphTranslator
              key={`${paragraphToTranslate.blockId}-${translationSettings.targetLanguage}-${translationSettings.style}-${translationSettings.contextMode}`}
              blockId={paragraphToTranslate.blockId}
              text={paragraphToTranslate.text}
              settings={translationSettings}
            />
          )}
        </section>
      )}
    </main>
  );
}

export default App;
