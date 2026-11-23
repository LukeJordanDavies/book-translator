import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

type JobStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

interface TranslationJob {
  id: number;
  bookId: number;
  status: JobStatus;
  lastError: string | null;
}

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

interface JobSnapshot {
  job: TranslationJob | null;
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

function getStatusLabel(
  status: JobStatus | "not-started"
): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Translating";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Not started";
  }
}

export default function FullBookTranslator({
  bookId,
  settings,
  onBatchCompleted,
}: FullBookTranslatorProps) {
  const [snapshot, setSnapshot] =
    useState<JobSnapshot | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Prevent overlapping Start/Pause/Resume commands.
  const actionInProgressRef = useRef(false);

  // Prevent old responses from changing the UI
  // after selecting another book or language.
  const generationRef = useRef(0);
  const requestVersionRef = useRef(0);

  // Used to refresh the chapter reader when
  // the server saves more translations.
  const lastBlockCountRef =
    useRef<number | null>(null);

  const onBatchCompletedRef =
    useRef(onBatchCompleted);

  useEffect(() => {
    onBatchCompletedRef.current =
      onBatchCompleted;
  }, [onBatchCompleted]);

  const acceptSnapshot = useCallback(
    (result: JobSnapshot) => {
      if (
        !result ||
        !result.progress ||
        typeof result.progress.translatedBlocks !==
          "number"
      ) {
        throw new Error(
          "Invalid translation progress response"
        );
      }

      const previousCount =
        lastBlockCountRef.current;

      const newCount =
        result.progress.translatedBlocks;

      if (
        previousCount !== null &&
        newCount > previousCount
      ) {
        onBatchCompletedRef.current?.();
      }

      lastBlockCountRef.current = newCount;

      setSnapshot(result);
    },
    []
  );

  // Load an existing job and poll SQLite progress.
  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();

    let polling = false;

    lastBlockCountRef.current = null;

    setSnapshot(null);
    setLoading(true);
    setError("");

    const query = new URLSearchParams({
      targetLanguage: settings.targetLanguage,
      style: settings.style,
      contextMode: settings.contextMode,
    });

    async function loadProgress() {
      if (polling || actionInProgressRef.current) {
        return;
      }

      polling = true;

      const requestVersion =
        requestVersionRef.current;

      try {
        const response = await fetch(
          `/api/translation-jobs/by-book/${bookId}?${query}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            await getResponseError(response)
          );
        }

        const result: JobSnapshot =
          await response.json();

        if (
          controller.signal.aborted ||
          generation !== generationRef.current ||
          requestVersion !==
            requestVersionRef.current
        ) {
          return;
        }

        acceptSnapshot(result);
        setError("");
      } catch (err) {
        if (
          controller.signal.aborted ||
          generation !== generationRef.current ||
          requestVersion !==
            requestVersionRef.current
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Could not refresh translation progress"
        );
      } finally {
        polling = false;

        if (
          !controller.signal.aborted &&
          generation === generationRef.current
        ) {
          setLoading(false);
        }
      }
    }

    // Check immediately when the book is selected.
    void loadProgress();

    // Subsequent checks only read saved progress.
    // They do not trigger additional translations.
    const intervalId = window.setInterval(() => {
      void loadProgress();
    }, 3000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
      generationRef.current++;
    };
  }, [
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
    refreshKey,
    acceptSnapshot,
  ]);

  async function sendJobCommand(
    command: "start" | "pause" | "resume"
  ) {
    if (actionInProgressRef.current) {
      return;
    }

    const currentJobId = snapshot?.job?.id;

    if (
      command !== "start" &&
      currentJobId === undefined
    ) {
      setError("No translation job exists yet.");
      return;
    }

    actionInProgressRef.current = true;
    requestVersionRef.current++;

    const generation = generationRef.current;

    setBusy(true);
    setError("");

    try {
      const url =
        command === "start"
          ? "/api/translation-jobs"
          : `/api/translation-jobs/${currentJobId}/${command}`;

      const requestBody =
        command === "start"
          ? JSON.stringify({
              bookId,
              settings,
            })
          : undefined;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (!response.ok) {
        throw new Error(
          await getResponseError(response)
        );
      }

      const result: JobSnapshot =
        await response.json();

      if (generation !== generationRef.current) {
        return;
      }

      acceptSnapshot(result);
    } catch (err) {
      if (generation === generationRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Translation job command failed"
        );
      }
    } finally {
      actionInProgressRef.current = false;
      setBusy(false);
    }
  }

  const progress = snapshot?.progress;
  const job = snapshot?.job;

  const status = job?.status ?? "not-started";

  const canStartOrResume =
    !loading &&
    !busy &&
    !!progress &&
    !progress.finished &&
    progress.totalBlocks > 0 &&
    status !== "running";

  const nextChapterId = progress?.nextChapterId;

  const nextChapterIndex = progress
    ? progress.chapters.findIndex(
        (chapter) =>
          chapter.chapterId === nextChapterId
      )
    : -1;

  return (
    <section className="full-book-translator">
      <h3>Full-book translation</h3>

      <p>
        Language: {settings.targetLanguage}
        {" · "}
        Style: {settings.style}
      </p>

      <p role="status">
        <strong>Status:</strong>{" "}
        {progress?.finished
          ? "Completed"
          : getStatusLabel(status)}
      </p>

      {loading && (
        <p>Loading translation progress...</p>
      )}

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
              Translation complete. Refresh the EPUB
              export status to download your book.
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

      {status === "running" && (
        <p role="status">
          The server is translating this book.
          You can close the browser and return later.
        </p>
      )}

      {status === "paused" && (
        <p role="status">
          Translation is paused. The current batch
          may still be finishing.
        </p>
      )}

      {status === "failed" && (
        <p role="alert">
          Translation stopped because of an error.
          You can review the error and resume.
        </p>
      )}

      {job?.lastError && status === "failed" && (
        <p className="full-book-error">
          {job.lastError}
        </p>
      )}

      <div className="full-book-actions">
        <button
          type="button"
          onClick={() =>
            void sendJobCommand(
              job ? "resume" : "start"
            )
          }
          disabled={!canStartOrResume}
        >
          {busy
            ? "Processing..."
            : job
              ? "Resume translation"
              : "Start translation"}
        </button>

        <button
          type="button"
          onClick={() =>
            void sendJobCommand("pause")
          }
          disabled={
            busy ||
            loading ||
            status !== "running"
          }
        >
          Pause translation
        </button>

        <button
          type="button"
          onClick={() => {
            setRefreshKey((value) => value + 1);
          }}
          disabled={loading || busy}
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

