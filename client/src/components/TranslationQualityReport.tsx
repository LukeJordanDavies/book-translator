import {
  useEffect,
  useState,
} from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

import "./TranslationQualityReport.css";

type IssueKind =
  | "missing_translation"
  | "missing_translated_html"
  | "untranslated_source"
  | "short_translation"
  | "formatting_difference"
  | "glossary_inconsistency";

interface QualityIssue {
  kind: IssueKind;
  blockId: number;
  chapterTitle: string;
  message: string;
  sourcePreview: string;
  translationPreview: string;
}

interface QualityReport {
  bookId: number;
  generatedAt: string;
  totalBlocks: number;
  translatedBlocks: number;
  missingBlocks: number;
  totalIssues: number;
  displayLimit: number;
  issueCounts: Record<IssueKind, number>;
  issues: QualityIssue[];
}

interface Props {
  bookId: number;
  settings: TranslationOptions;
  refreshKey?: number;
}

const ISSUE_LABELS: Record<
  IssueKind,
  string
> = {
  missing_translation: "Missing translation",
  missing_translated_html: "Missing XHTML",
  untranslated_source: "Untranslated text",
  short_translation: "Short translation",
  formatting_difference: "Formatting difference",
  glossary_inconsistency: "Glossary inconsistency",
};

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

export default function TranslationQualityReport({
  bookId,
  settings,
  refreshKey = 0,
}: Props) {
  const [report, setReport] =
    useState<QualityReport | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [filter, setFilter] =
    useState<IssueKind | "all">("all");

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError("");
    setReport(null);

    async function loadReport() {
      try {
        const params = new URLSearchParams({
          targetLanguage:
            settings.targetLanguage,
          style: settings.style,
          contextMode: settings.contextMode,
        });

        const response = await fetch(
          `/api/translation-quality/${bookId}?${params}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            await getApiError(response)
          );
        }

        const data: QualityReport =
          await response.json();

        if (!controller.signal.aborted) {
          setReport(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not generate quality report"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      controller.abort();
    };
  }, [
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
    refreshKey,
    refreshVersion,
  ]);

  const visibleIssues = report
    ? report.issues.filter(
        (issue) =>
          filter === "all" ||
          issue.kind === filter
      )
    : [];

  const completionPercentage =
    report && report.totalBlocks > 0
      ? Math.round(
          report.translatedBlocks /
          report.totalBlocks * 100
        )
      : 0;

  return (
    <section className="translation-quality-report">
      <div className="quality-header">
        <div>
          <h3>Translation quality report</h3>

          <p>
            Review saved translations for{" "}
            <strong>
              {settings.targetLanguage}
            </strong>.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() =>
            setRefreshVersion(
              (current) => current + 1
            )
          }
        >
          {loading
            ? "Checking..."
            : "Run quality checks"}
        </button>
      </div>

      <p className="quality-notice">
        These checks do not use OpenAI or change
        saved translations. Warnings may need
        manual review.
      </p>

      {loading && (
        <p role="status">
          Checking translated passages...
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="quality-error"
        >
          {error}
        </p>
      )}

      {report && (
        <>
          <div className="quality-summary">
            <div>
              <span>Translation progress</span>
              <strong>
                {completionPercentage}%
              </strong>
            </div>

            <div>
              <span>Translated blocks</span>
              <strong>
                {report.translatedBlocks} /{" "}
                {report.totalBlocks}
              </strong>
            </div>

            <div>
              <span>Missing blocks</span>
              <strong>
                {report.missingBlocks}
              </strong>
            </div>

            <div>
              <span>Review warnings</span>
              <strong>
                {report.totalIssues}
              </strong>
            </div>
          </div>

          <progress
            className="quality-progress"
            value={report.translatedBlocks}
            max={Math.max(
              report.totalBlocks,
              1
            )}
            aria-label="Translation completion"
          />

          {report.missingBlocks > 0 && (
            <p className="quality-warning">
              This book still has untranslated
              text blocks. Complete them before
              exporting the translated EPUB.
            </p>
          )}

          <div className="quality-filter">
            <label htmlFor="quality-filter-select">
              Show warnings
            </label>

            <select
              id="quality-filter-select"
              value={filter}
              onChange={(event) =>
                setFilter(
                  event.target.value as
                    IssueKind | "all"
                )
              }
            >
              <option value="all">
                All warnings
              </option>

              {(
                Object.keys(
                  ISSUE_LABELS
                ) as IssueKind[]
              ).map((kind) => (
                <option
                  key={kind}
                  value={kind}
                >
                  {ISSUE_LABELS[kind]} (
                  {report.issueCounts[kind]})
                </option>
              ))}
            </select>
          </div>

          {report.totalIssues === 0 ? (
            <p
              role="status"
              className="quality-success"
            >
              No issues were detected by the
              automated checks.
            </p>
          ) : (
            <>
              <p className="quality-count">
                {report.issues.length} of{" "}
                {report.totalIssues} warnings
                available for review.
              </p>

              {report.totalIssues >
                report.issues.length && (
                <p>
                  Only the first{" "}
                  {report.displayLimit} warnings
                  are included in this report.
                </p>
              )}

              {visibleIssues.length === 0 && (
                <p>
                  No warnings of this type are
                  included in the displayed results.
                </p>
              )}

              <div className="quality-issue-list">
                {visibleIssues.map(
                  (issue, index) => (
                    <article
                      className="quality-issue"
                      key={
                        `${issue.blockId}-${issue.kind}-${index}`
                      }
                    >
                      <div className="quality-issue-heading">
                        <strong>
                          {ISSUE_LABELS[issue.kind]}
                        </strong>

                        <span>
                          {issue.chapterTitle}
                          {" · "}
                          Block {issue.blockId}
                        </span>
                      </div>

                      <p>{issue.message}</p>

                      <div className="quality-passage">
                        <span>
                          Original
                        </span>

                        <p>
                          {issue.sourcePreview}
                        </p>
                      </div>

                      {issue.translationPreview && (
                        <div className="quality-passage">
                          <span>
                            Saved translation
                          </span>

                          <p>
                            {issue.translationPreview}
                          </p>
                        </div>
                      )}
                    </article>
                  )
                )}
              </div>
            </>
          )}

          <p className="quality-timestamp">
            Checked:{" "}
            {new Date(
              report.generatedAt
            ).toLocaleString()}
          </p>
        </>
      )}
    </section>
  );
}
