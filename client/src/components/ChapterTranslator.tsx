import { useEffect, useRef, useState } from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

interface ChapterTranslatorProps {
  bookId: number;
  chapterId: string;
  settings: TranslationOptions;
  onBatchCompleted: () => void;
}

interface TranslationProgress {
  total: number;
  completed: number;
  remaining: number;
  finished: boolean;
}

function ChapterTranslator({
  bookId,
  chapterId,
  settings,
  onBatchCompleted,
}: ChapterTranslatorProps) {
  const [progress, setProgress] =
    useState<TranslationProgress | null>(null);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const stopRequested = useRef(false);

  useEffect(() => {
    stopRequested.current = true;
    setProgress(null);
    setRunning(false);
    setError("");
  }, [
    bookId,
    chapterId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
  ]);

  async function handleTranslate() {
    if (running) return;

    stopRequested.current = false;
    setRunning(true);
    setError("");

    try {
      let finished = false;

      while (!finished && !stopRequested.current) {
        const response = await fetch(
          "/api/translations/chapter",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              bookId,
              chapterId,
              settings,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Chapter translation failed"
          );
        }

        setProgress(data);
        onBatchCompleted();
        finished = data.finished;
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong"
      );
    } finally {
      setRunning(false);
    }
  }

  function handleStop() {
    stopRequested.current = true;
  }

  const percentage = progress
    ? progress.total === 0
      ? 100
      : Math.round(
          (progress.completed / progress.total) * 100
        )
    : 0;

  return (
    <section>
      <h3>Chapter Translation</h3>

      <p>
        Translate this chapter into {settings.targetLanguage}.
      </p>

      <button
        type="button"
        onClick={handleTranslate}
        disabled={running}
      >
        {running
          ? "Translating..."
          : progress && progress.completed > 0
            ? "Resume Translation"
            : "Translate Chapter"}
      </button>

      {running && (
        <button
          type="button"
          onClick={handleStop}
        >
          Stop After Current Batch
        </button>
      )}

      {progress && (
        <div>
          <p>
            {progress.completed} of {progress.total} paragraphs
          </p>

          <progress
            value={progress.completed}
            max={progress.total || 1}
          />

          <p>{percentage}% complete</p>

          {progress.finished && (
            <p>Chapter translation complete!</p>
          )}
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default ChapterTranslator;
