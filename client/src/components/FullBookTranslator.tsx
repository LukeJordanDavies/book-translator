import { useEffect, useRef, useState } from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

interface ChapterProgress {
  chapterId: number;
  position: number;
  total: number;
  completed: number;
  remaining: number;
  finished: boolean;
}

interface BookTranslationProgress {
  bookId: number;
  chapterCount: number;
  completedChapters: number;
  totalBlocks: number;
  translatedBlocks: number;
  remainingBlocks: number;
  percentage: number;
  finished: boolean;
  nextChapterId: number | null;
  chapters: ChapterProgress[];
}

interface BatchResponse {
  processedChapterId: number | null;
  progress: BookTranslationProgress;
}

interface FullBookTranslatorProps {
  bookId: number;
  settings: TranslationOptions;
  onBatchCompleted?: () => void;
}

async function getResponseError(
  response: Response
): Promise<string> {
  const body: unknown = await response
    .json()
    .catch(() => null);

  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return `Request failed (${response.status})`;
}

export default function FullBookTranslator({
  bookId,
  settings,
  onBatchCompleted,
}: FullBookTranslatorProps) {
  const [progress, setProgress] =
    useState<BookTranslationProgress | null>(null);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const [pauseRequested, setPauseRequested] =
    useState(false);

  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // These refs control the translation loop
  // without waiting for a React state update.
  const stopRequestedRef = useRef(false);
  const activeRef = useRef(false);

  // Prevent results for an old book or language
  // from updating the currently selected book.
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();

    // If a different book or language was selected,
    // finish the old in-flight batch but do not
    // request another.
    stopRequestedRef.current = true;

    setProgress(null);
    setError("");
    setLoading(true);
    setPauseRequested(activeRef.current);

    async function loadProgress() {
      const query = new URLSearchParams({
        targetLanguage: settings.targetLanguage,
        style: settings.style,
        contextMode: settings.contextMode,
      });

      try {
        const response = await fetch(
          `/api/book-translation/${bookId}/progress?${query}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            await getResponseError(response)
          );
        }

        const result: BookTranslationProgress =
          await response.json();

        if (
          generation === generationRef.current &&
          !controller.signal.aborted
        ) {
          setProgress(result);
        }
      } catch (err) {
        if (
          controller.signal.aborted ||
          generation !== generationRef.current
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load book progress"
        );
      } finally {
        if (
          generation === generationRef.current &&
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    void loadProgress();

    return () => {
      stopRequestedRef.current = true;
      generationRef.current++;
      controller.abort();
    };
  }, [
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
    refreshKey,
  ]);

  async function startTranslation() {
    if (
      activeRef.current ||
      loading ||
      !progress ||
      progress.finished ||
      progress.totalBlocks === 0
    ) {
      return;
    }

    activeRef.current = true;
    stopRequestedRef.current = false;

    const generation = generationRef.current;

    let currentProgress = progress;

    setRunning(true);
    setPauseRequested(false);
    setError("");

    try {
      while (
        !stopRequestedRef.current &&
        !currentProgress.finished
      ) {
        const response = await fetch(
          `/api/book-translation/${bookId}/next`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              settings,
            }),
          }
        );

        const body: unknown = await response
          .json()
          .catch(() => null);

        // The selected book or settings changed
        // while the request was running.
        if (generation !== generationRef.current) {
          break;
        }

        if (!response.ok) {
          const message =
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : `Translation failed (${response.status})`;

          throw new Error(message);
        }

        const result = body as BatchResponse | null;

        if (
          !result?.progress ||
          typeof result.progress.translatedBlocks !==
            "number"
        ) {
          throw new Error(
            "The server returned invalid progress data"
          );
        }

        if (
          !result.progress.finished &&
          result.progress.translatedBlocks <=
            currentProgress.translatedBlocks
        ) {
          throw new Error(
            "Translation made no progress"
          );
        }

        currentProgress = result.progress;

        // Update the progress bar after each batch.
        setProgress(currentProgress);

        // Optionally refresh the existing chapter
        // reader in App.tsx.
        onBatchCompleted?.();
      }
    } catch (err) {
      if (generation === generationRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : "An unexpected translation error occurred"
        );
      }
    } finally {
      activeRef.current = false;
      setRunning(false);
      setPauseRequested(false);
    }
  }

  function pauseTranslation() {
    if (!activeRef.current) {
      return;
    }

    // Let the current batch finish normally.
    // The next loop iteration will not start.
    stopRequestedRef.current = true;
    setPauseRequested(true);
  }

  const nextChapterIndex =
    progress?.chapters.findIndex(
      (chapter) =>
        chapter.chapterId === progress.nextChapterId
    ) ?? -1;

  return (
    <section className="full-book-translator">
      <h3>Full-book translation</h3>

      <p>
        Language: {settings.targetLanguage}
        {" · "}
        Style: {settings.style}
      </p>

      {loading && <p>Loading translation progress...</p>}

      {progress && (
        <>
          <div className="full-book-progress-details">
            <p>
              <strong>{progress.percentage}%</strong>
              {" "}complete
            </p>

            <p>
              {progress.translatedBlocks} /{" "}
              {progress.totalBlocks} text blocks
            </p>

            <p>
              {progress.completedChapters} /{" "}
              {progress.chapterCount} chapters complete
            </p>
          </div>

          <progress
            className="full-book-progress-bar"
            value={progress.translatedBlocks}
            max={Math.max(progress.totalBlocks, 1)}
            aria-label="Full-book translation progress"
          />

          {progress.finished ? (
            <p role="status">
              Translation complete. The book is ready
              for EPUB export.
            </p>
          ) : progress.totalBlocks === 0 ? (
            <p>
              This book contains no supported text
              blocks to translate.
            </p>
          ) : (
            <p>
              {nextChapterIndex >= 0
                ? `Next unfinished chapter: ${
                    nextChapterIndex + 1
                  }`
                : "No unfinished chapter found"}
            </p>
          )}
        </>
      )}

      {running && (
        <p role="status">
          {pauseRequested
            ? "Pausing after the current batch..."
            : "Translating the next batch..."}
        </p>
      )}

      <div className="full-book-actions">
        <button
          type="button"
          onClick={() => void startTranslation()}
          disabled={
            loading ||
            running ||
            !progress ||
            progress.finished ||
            progress.totalBlocks === 0
          }
        >
          {progress?.translatedBlocks
            ? "Resume translation"
            : "Start translation"}
        </button>

        <button
          type="button"
          onClick={pauseTranslation}
          disabled={!running || pauseRequested}
        >
          {pauseRequested
            ? "Pausing..."
            : "Pause translation"}
        </button>

        <button
          type="button"
          onClick={() => {
            setRefreshKey((value) => value + 1);
          }}
          disabled={loading || running}
        >
          Refresh progress
        </button>
      </div>

      {error && (
        <p role="alert" className="full-book-error">
          {error}
        </p>
      )}
    </section>
  );
}
