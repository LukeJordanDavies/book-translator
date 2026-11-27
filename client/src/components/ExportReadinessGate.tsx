import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

import "./ExportReadinessGate.css";

type ReadinessStatus =
  | "blocked"
  | "ready_with_warnings"
  | "ready";

type IssueKind =
  | "missing_translation"
  | "missing_translated_html"
  | "untranslated_source"
  | "short_translation"
  | "formatting_difference"
  | "glossary_inconsistency"
  | "possible_omission"
  | "possible_addition"
  | "repeated_translation"
  | "number_mismatch";

interface ExportBlocker {
  code: string;
  message: string;
  count: number;
}

interface ExportReadiness {
  bookId: number;
  status: ReadinessStatus;
  canProceed: boolean;

  totalBlocks: number;
  translatedBlocks: number;
  missingBlocks: number;

  totalQualityIssues: number;
  warningCount: number;

  reviewedVisibleIssues: number;
  unreviewedVisibleIssues: number;
  visibleIssueCount: number;
  hasMoreIssues: boolean;

  issueCounts: Record<IssueKind, number>;
  blockers: ExportBlocker[];
  snapshotId: string;
}

interface Props {
  bookId: number;
  settings: TranslationOptions;
  refreshKey?: number;
  children: ReactNode;
}

const WARNING_LABELS: Array<{
  kind: IssueKind;
  label: string;
}> = [
  {
    kind: "formatting_difference",
    label: "Formatting differences",
  },
  {
    kind: "glossary_inconsistency",
    label: "Glossary inconsistencies",
  },
  {
    kind: "untranslated_source",
    label: "Possibly untranslated passages",
  },
  {
    kind: "short_translation",
    label: "Unusually short translations",
  },
  {
    kind: "possible_omission",
    label: "Possible omitted passages",
  },
  {
    kind: "possible_addition",
    label: "Possible added content",
  },
  {
    kind: "repeated_translation",
    label: "Repeated translated sentences",
  },
  {
    kind: "number_mismatch",
    label: "Numerical inconsistencies",
  },
];

async function getError(
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

async function fetchReadiness(
  bookId: number,
  settings: TranslationOptions,
  signal?: AbortSignal
): Promise<ExportReadiness> {
  const query = new URLSearchParams({
    targetLanguage: settings.targetLanguage,
    style: settings.style,
    contextMode: settings.contextMode,
  });

  const response = await fetch(
    `/api/export-readiness/${bookId}?${query}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error(
      await getError(response)
    );
  }

  const data: ExportReadiness =
    await response.json();

  if (
    !data ||
    typeof data.canProceed !== "boolean" ||
    typeof data.snapshotId !== "string" ||
    !Array.isArray(data.blockers)
  ) {
    throw new Error(
      "Invalid export-readiness response"
    );
  }

  return data;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred";
}

export default function ExportReadinessGate({
  bookId,
  settings,
  refreshKey = 0,
  children,
}: Props) {
  const [report, setReport] =
    useState<ExportReadiness | null>(null);

  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] =
    useState(false);

  const [unlocked, setUnlocked] =
    useState(false);

  const [acknowledged, setAcknowledged] =
    useState(false);

  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] =
    useState(0);

  // Prevent responses for an old book or
  // settings combination from updating this UI.
  const generationRef = useRef(0);

  useEffect(() => {
    const generation =
      ++generationRef.current;

    const controller = new AbortController();

    setReport(null);
    setLoading(true);
    setUnlocked(false);
    setAcknowledged(false);
    setError("");

    async function load() {
      try {
        const result = await fetchReadiness(
          bookId,
          settings,
          controller.signal
        );

        if (
          !controller.signal.aborted &&
          generation === generationRef.current
        ) {
          setReport(result);
        }
      } catch (err) {
        if (
          !controller.signal.aborted &&
          generation === generationRef.current
        ) {
          setError(errorMessage(err));
        }
      } finally {
        if (
          !controller.signal.aborted &&
          generation === generationRef.current
        ) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
      generationRef.current++;
    };
  }, [
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
    refreshKey,
    refreshVersion,
  ]);

  async function checkAndUnlock() {
    if (
      loading ||
      unlocking ||
      !report?.canProceed
    ) {
      return;
    }

    if (
      report.warningCount > 0 &&
      !acknowledged
    ) {
      setError(
        "Acknowledge the outstanding warnings " +
        "before continuing."
      );
      return;
    }

    const generation =
      generationRef.current;

    setUnlocking(true);
    setError("");

    try {
      // Check the current database state
      // again before showing download controls.
      const latest = await fetchReadiness(
        bookId,
        settings
      );

      if (
        generation !== generationRef.current
      ) {
        return;
      }

      setReport(latest);

      if (
        latest.snapshotId !== report.snapshotId
      ) {
        setUnlocked(false);
        setAcknowledged(false);

        setError(
          "The translation or review status " +
          "changed. Check the updated summary " +
          "before continuing."
        );

        return;
      }

      if (!latest.canProceed) {
        setUnlocked(false);
        setError(
          "The book is no longer ready for export."
        );
        return;
      }

      setUnlocked(true);
    } catch (err) {
      if (
        generation === generationRef.current
      ) {
        setError(errorMessage(err));
      }
    } finally {
      if (
        generation === generationRef.current
      ) {
        setUnlocking(false);
      }
    }
  }

  const percentage =
    report && report.totalBlocks > 0
      ? Math.round(
          report.translatedBlocks /
          report.totalBlocks *
          100
        )
      : 0;

  return (
    <section className="export-readiness-gate">
      <div className="export-readiness-heading">
        <div>
          <h3>Final EPUB export review</h3>
          <p>
            Check the book before downloading
            your translated EPUB.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || unlocking}
          onClick={() => {
            setRefreshVersion(
              (value) => value + 1
            );
          }}
        >
          {loading
            ? "Checking..."
            : "Check again"}
        </button>
      </div>

      {loading && (
        <p role="status">
          Checking export readiness...
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="export-readiness-error"
        >
          {error}
        </p>
      )}

      {report && (
        <>
          <p
            className="export-readiness-status"
            role="status"
          >
            <strong>Status: </strong>
            {report.status === "blocked"
              ? "Blocked"
              : report.status ===
                  "ready_with_warnings"
                ? "Ready with warnings"
                : "Ready"}
          </p>

          <div className="export-readiness-summary">
            <div>
              <span>Translation progress</span>
              <strong>{percentage}%</strong>
            </div>

            <div>
              <span>Translated blocks</span>
              <strong>
                {report.translatedBlocks} /{" "}
                {report.totalBlocks}
              </strong>
            </div>

            <div>
              <span>Quality warnings</span>
              <strong>
                {report.warningCount}
              </strong>
            </div>

            <div>
              <span>Review decisions</span>
              <strong>
                {report.reviewedVisibleIssues} /{" "}
                {report.visibleIssueCount}
              </strong>
            </div>
          </div>

          <progress
            className="export-readiness-progress"
            value={report.translatedBlocks}
            max={Math.max(
              report.totalBlocks,
              1
            )}
            aria-label="Translation completion"
          />

          <p className="export-readiness-help">
            Review decisions refer to the first{" "}
            {report.visibleIssueCount} displayed
            quality issues, not necessarily every
            warning in the book.
          </p>

          {report.hasMoreIssues && (
            <p className="export-readiness-notice">
              Additional issues exist beyond the
              quality report's display limit.
              Review the quality report before
              proceeding.
            </p>
          )}

          {report.blockers.length > 0 && (
            <div className="export-readiness-blockers">
              <h4>Problems to resolve</h4>

              <ul>
                {report.blockers.map(
                  (blocker) => (
                    <li key={blocker.code}>
                      {blocker.message}
                    </li>
                  )
                )}
              </ul>

              <p>
                Complete the missing translations
                or repair the missing XHTML,
                then check readiness again.
              </p>
            </div>
          )}

          {report.warningCount > 0 && (
            <div className="export-readiness-warnings">
              <h4>Quality warnings</h4>

              <ul>
                {WARNING_LABELS.map(
                  ({ kind, label }) =>
                    report.issueCounts[kind] > 0
                      ? (
                        <li key={kind}>
                          {label}:{" "}
                          {report.issueCounts[kind]}
                        </li>
                      )
                      : null
                )}
              </ul>

              <p>
                These warnings don't necessarily
                mean the translation is incorrect.
                Review them in your existing
                quality report.
              </p>
            </div>
          )}

          {report.canProceed && !unlocked && (
            <div className="export-readiness-actions">
              {report.warningCount > 0 && (
                <label className="export-readiness-confirm">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) =>
                      setAcknowledged(
                        event.target.checked
                      )
                    }
                  />

                  <span>
                    I've reviewed the quality
                    report and understand that
                    outstanding warnings may
                    affect the translated EPUB.
                  </span>
                </label>
              )}

              <button
                type="button"
                disabled={
                  unlocking ||
                  (
                    report.warningCount > 0 &&
                    !acknowledged
                  )
                }
                onClick={() => {
                  void checkAndUnlock();
                }}
              >
                {unlocking
                  ? "Checking..."
                  : "Continue to EPUB export"}
              </button>
            </div>
          )}

          {unlocked && (
            <div className="export-readiness-download">
              <p role="status">
                Readiness check completed.
                You can now use the existing
                EPUB export controls below.
              </p>

              {children}

              <button
                type="button"
                className="export-readiness-hide"
                onClick={() =>
                  setUnlocked(false)
                }
              >
                Hide export controls
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
