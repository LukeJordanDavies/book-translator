import {
  useEffect,
  useState,
} from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

import "./GlossaryRetranslation.css";

interface GlossaryEntry {
  id: number;
  sourceTerm: string;
  translatedTerm: string;
}

interface Candidate {
  blockId: number;
  chapterId: number;
  chapterTitle: string;
  blockType: string;
  sourcePreview: string;
  translationPreview: string;
}

interface ReviewResult {
  entry: GlossaryEntry;
  totalCandidates: number;
  candidates: Candidate[];
}

interface RetranslationResult {
  updatedIds: number[];
  failures: Array<{
    blockId: number;
    error: string;
  }>;
}

interface Props {
  bookId: number;
  settings: TranslationOptions;
  onTranslationsChanged?: () => void;
}

const MAX_SELECTED = 5;

async function getApiError(
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

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred";
}

export default function GlossaryRetranslation({
  bookId,
  settings,
  onTranslationsChanged,
}: Props) {
  const [entries, setEntries] =
    useState<GlossaryEntry[]>([]);

  const [entryId, setEntryId] =
    useState<number | null>(null);

  const [review, setReview] =
    useState<ReviewResult | null>(null);

  const [selectedIds, setSelectedIds] =
    useState<number[]>([]);

  const [loadingEntries, setLoadingEntries] =
    useState(true);

  const [loadingReview, setLoadingReview] =
    useState(false);

  const [retranslating, setRetranslating] =
    useState(false);

  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [failures, setFailures] =
    useState<RetranslationResult["failures"]>(
      []
    );

  const busy =
    loadingEntries ||
    loadingReview ||
    retranslating;

  // Load the glossary for the selected book.
  useEffect(() => {
    const controller = new AbortController();

    async function loadEntries() {
      setLoadingEntries(true);

      try {
        const params = new URLSearchParams({
          targetLanguage:
            settings.targetLanguage,
        });

        const response = await fetch(
          `/api/books/${bookId}/glossary?${params}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(
            await getApiError(response)
          );
        }

        const data: {
          entries: GlossaryEntry[];
        } = await response.json();

        if (controller.signal.aborted) {
          return;
        }

        setEntries(data.entries);

        setEntryId((current) =>
          data.entries.some(
            (entry) => entry.id === current
          )
            ? current
            : null
        );
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(errorMessage(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingEntries(false);
        }
      }
    }

    void loadEntries();

    return () => controller.abort();
  }, [
    bookId,
    settings.targetLanguage,
    refreshVersion,
  ]);

  // Find saved passages for the chosen term.
  useEffect(() => {
    const controller = new AbortController();

    setReview(null);
    setSelectedIds([]);

    if (entryId === null) {
      setLoadingReview(false);
      return () => controller.abort();
    }

    async function loadCandidates() {
      setLoadingReview(true);
      setError("");

      try {
        const params = new URLSearchParams({
          entryId: String(entryId),
          targetLanguage:
            settings.targetLanguage,
          style: settings.style,
          contextMode: settings.contextMode,
        });

        const response = await fetch(
          `/api/glossary-retranslation/${bookId}/candidates?${params}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(
            await getApiError(response)
          );
        }

        const data: ReviewResult =
          await response.json();

        if (!controller.signal.aborted) {
          setReview(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(errorMessage(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingReview(false);
        }
      }
    }

    void loadCandidates();

    return () => controller.abort();
  }, [
    bookId,
    entryId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
    refreshVersion,
  ]);

  function toggleBlock(blockId: number) {
    setSelectedIds((current) => {
      if (current.includes(blockId)) {
        return current.filter(
          (id) => id !== blockId
        );
      }

      if (current.length >= MAX_SELECTED) {
        return current;
      }

      return [...current, blockId];
    });
  }

  async function retranslate() {
    if (
      busy ||
      entryId === null ||
      selectedIds.length === 0
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Retranslate ${selectedIds.length} ` +
      "selected passage(s)?\n\n" +
      "This replaces their saved translations " +
      "and uses paid OpenAI API requests."
    );

    if (!confirmed) {
      return;
    }

    setRetranslating(true);
    setError("");
    setMessage("");
    setFailures([]);

    try {
      const response = await fetch(
        `/api/glossary-retranslation/${bookId}/retranslate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entryId,
            settings,
            blockIds: selectedIds,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          await getApiError(response)
        );
      }

      const result: RetranslationResult =
        await response.json();

      setFailures(result.failures);

      setMessage(
        `${result.updatedIds.length} ` +
        "passage(s) successfully retranslated."
      );

      if (result.updatedIds.length > 0) {
        onTranslationsChanged?.();
      }

      // Reload the saved translations.
      setRefreshVersion(
        (current) => current + 1
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRetranslating(false);
    }
  }

  return (
    <section className="glossary-retranslation">
      <h3>Review glossary consistency</h3>

      <p>
        Find previously translated passages
        containing a glossary term, then choose
        which ones to regenerate.
      </p>

      <div className="glossary-review-controls">
        <label htmlFor="glossary-review-term">
          Glossary term
        </label>

        <select
          id="glossary-review-term"
          value={entryId ?? ""}
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value;

            setEntryId(
              value ? Number(value) : null
            );

            setMessage("");
            setFailures([]);
          }}
        >
          <option value="">
            Select a glossary term
          </option>

          {entries.map((entry) => (
            <option
              key={entry.id}
              value={entry.id}
            >
              {entry.sourceTerm}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            setRefreshVersion(
              (current) => current + 1
            )
          }
        >
          Refresh glossary and results
        </button>
      </div>

      <p className="glossary-review-description">
        Current settings:{" "}
        {settings.targetLanguage},{" "}
        {settings.style},{" "}
        {settings.contextMode} context.
      </p>

      {loadingEntries && (
        <p>Loading glossary...</p>
      )}

      {loadingReview && (
        <p>Finding matching passages...</p>
      )}

      {review && (
        <>
          <div className="glossary-review-summary">
            <p>
              <strong>Original term:</strong>{" "}
              {review.entry.sourceTerm}
            </p>

            <p>
              <strong>Preferred translation:</strong>{" "}
              {review.entry.translatedTerm}
            </p>

            <p>
              <strong>Saved passages found:</strong>{" "}
              {review.totalCandidates}
            </p>
          </div>

          <p>
            These are passages containing the
            original term. Some may already use
            the correct translation.
          </p>

          {review.totalCandidates >
            review.candidates.length && (
            <p>
              Showing the first{" "}
              {review.candidates.length} passages.
            </p>
          )}

          {review.candidates.length === 0 ? (
            <p>
              No matching saved translations
              were found for these settings.
            </p>
          ) : (
            <>
              <div className="glossary-review-list">
                {review.candidates.map(
                  (candidate) => {
                    const checked =
                      selectedIds.includes(
                        candidate.blockId
                      );

                    return (
                      <label
                        className="glossary-review-item"
                        key={candidate.blockId}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={
                            busy ||
                            (!checked &&
                              selectedIds.length >=
                                MAX_SELECTED)
                          }
                          onChange={() =>
                            toggleBlock(
                              candidate.blockId
                            )
                          }
                        />

                        <span className="glossary-review-content">
                          <strong>
                            {candidate.chapterTitle}
                          </strong>

                          <span className="glossary-review-label">
                            Original
                          </span>

                          <span>
                            {candidate.sourcePreview}
                          </span>

                          <span className="glossary-review-label">
                            Current translation
                          </span>

                          <span>
                            {candidate.translationPreview}
                          </span>
                        </span>
                      </label>
                    );
                  }
                )}
              </div>

              <div className="glossary-review-actions">
                <p>
                  {selectedIds.length} /{" "}
                  {MAX_SELECTED} selected
                </p>

                <button
                  type="button"
                  disabled={
                    busy ||
                    selectedIds.length === 0
                  }
                  onClick={() =>
                    void retranslate()
                  }
                >
                  {retranslating
                    ? "Retranslating..."
                    : `Retranslate selected (${selectedIds.length})`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && (
        <p
          role="alert"
          className="glossary-review-error"
        >
          {error}
        </p>
      )}

      {message && (
        <p role="status">
          {message}
        </p>
      )}

      {failures.length > 0 && (
        <div
          className="glossary-review-error"
          role="alert"
        >
          <p>
            Some passages could not be updated.
            Their previous translations were kept.
          </p>

          <ul>
            {failures.map((failure) => (
              <li key={failure.blockId}>
                Block {failure.blockId}:{" "}
                {failure.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
