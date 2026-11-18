import { useEffect, useState } from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

interface ContentBlock {
  id: string;
  databaseId: number;
  type: "heading" | "paragraph";
  tagName: string;
  text: string;
}

interface ChapterReaderProps {
  bookId: number;
  chapterId: string;
  chapterTitle: string;
  blocks: ContentBlock[];
  settings: TranslationOptions;
  refreshKey: number;
}

interface SavedTranslation {
  blockId: number;
  translatedText: string;
}

function ChapterReader({
  bookId,
  chapterId,
  chapterTitle,
  blocks,
  settings,
  refreshKey,
}: ChapterReaderProps) {
  const [translations, setTranslations] = useState<
    Record<number, string>
  >({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const {
    targetLanguage,
    style,
    contextMode,
  } = settings;

  useEffect(() => {
    const controller = new AbortController();

    async function loadTranslations() {
      setLoading(true);
      setError("");
      setTranslations({});

      const params = new URLSearchParams({
        targetLanguage,
        style,
        contextMode,
      });

      try {
        const response = await fetch(
          `/api/translations/chapter/${bookId}/${encodeURIComponent(chapterId)}?${params}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(
            "Failed to load chapter translations"
          );
        }

        const data: {
          translations: SavedTranslation[];
        } = await response.json();

        if (controller.signal.aborted) return;

        const translationMap: Record<number, string> = {};

        for (const item of data.translations) {
          translationMap[item.blockId] =
            item.translatedText;
        }

        setTranslations(translationMap);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(
            error instanceof Error
              ? error.message
              : "Something went wrong"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadTranslations();

    return () => controller.abort();
  }, [
    bookId,
    chapterId,
    targetLanguage,
    style,
    contextMode,
    refreshKey,
  ]);

  const paragraphs = blocks.filter(
    (block) => block.type === "paragraph"
  );

  const translatedCount = paragraphs.filter(
    (block) =>
      translations[block.databaseId] !== undefined
  ).length;

  const percentage =
    paragraphs.length === 0
      ? 100
      : Math.round(
          (translatedCount / paragraphs.length) * 100
        );

  return (
    <section className="chapter-reader">
      <h2>{chapterTitle}</h2>

      <p>
        Translation: {targetLanguage} ({style})
      </p>

      {loading && <p>Loading translations...</p>}

      {error && <p role="alert">{error}</p>}

      {!loading && !error && (
        <>
          <p>
            {translatedCount} of {paragraphs.length}
            {" "}paragraphs translated ({percentage}%)
          </p>

          <progress
            value={translatedCount}
            max={paragraphs.length || 1}
          />

          <div className="chapter-reader-grid">
            <h3>Original</h3>
            <h3>Translation — {targetLanguage}</h3>

            {blocks.map((block) => {
              const translation =
                translations[block.databaseId];

              return (
                <div
                  className="chapter-reader-row"
                  key={block.id}
                >
                  <div className="reader-original">
                    {block.type === "heading" ? (
                      <h4>{block.text}</h4>
                    ) : (
                      <p>{block.text}</p>
                    )}
                  </div>

                  <div className="reader-translation">
                    {translation !== undefined ? (
                      <p>{translation}</p>
                    ) : block.type === "heading" ? (
                      <p className="reader-placeholder">
                        Heading not translated yet
                      </p>
                    ) : (
                      <p className="reader-placeholder">
                        Not translated yet
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default ChapterReader;
