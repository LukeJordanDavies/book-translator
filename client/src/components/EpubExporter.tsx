import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

import "./EpubExportDiagnostics.css";

interface ExportStatus {
  ready: boolean;
  total: number;
  translated: number;
  missing: number;
  missingBlockIds?: number[];
}

interface EpubReferenceIssue {
  kind: string;
  file: string;
  reference: string;
  message: string;
}

interface EpubReferenceReport {
  xhtmlFilesChecked: number;
  localReferencesChecked: number;
  totalIssues: number;
  issues: EpubReferenceIssue[];
}

interface EpubIntegrityResult {
  valid: boolean;
  report: EpubReferenceReport;
}

interface EpubExporterProps {
  bookId: number;
  settings: TranslationOptions;
}

interface ApiFailure {
  message: string;
  report: EpubReferenceReport | null;
}

async function readApiFailure(
  response: Response
): Promise<ApiFailure> {
  const body: unknown = await response
    .json()
    .catch(() => null);

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return {
      message:
        `Request failed (${response.status})`,
      report: null,
    };
  }

  const data =
    body as Record<string, unknown>;

  const message =
    typeof data.error === "string"
      ? data.error
      : `Request failed (${response.status})`;

  let report: EpubReferenceReport | null =
    null;

  if (
    data.report &&
    typeof data.report === "object" &&
    !Array.isArray(data.report)
  ) {
    const candidate =
      data.report as Record<string, unknown>;

    if (
      typeof candidate.totalIssues ===
        "number" &&
      Array.isArray(candidate.issues)
    ) {
      report =
        data.report as unknown as
          EpubReferenceReport;
    }
  }

  return {
    message,
    report,
  };
}

function getErrorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred";
}

function downloadBlob(
  blob: Blob,
  filename: string
) {
  const url = URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export default function EpubExporter({
  bookId,
  settings,
}: EpubExporterProps) {
  const [status, setStatus] =
    useState<ExportStatus | null>(null);

  const [inspection, setInspection] =
    useState<EpubIntegrityResult | null>(
      null
    );

  const [checking, setChecking] =
    useState(true);

  const [inspecting, setInspecting] =
    useState(false);

  const [downloading, setDownloading] =
    useState(false);

  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [error, setError] = useState("");
  const [message, setMessage] =
    useState("");

  const requestKey = JSON.stringify([
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
  ]);

  const currentKeyRef = useRef(requestKey);
  currentKeyRef.current = requestKey;

  const busy =
    checking || inspecting || downloading;

  const requestBody = JSON.stringify({
    bookId,
    settings,
  });

  // Check translation completeness whenever
  // the selected book or settings change.
  useEffect(() => {
    const controller = new AbortController();

    setChecking(true);
    setStatus(null);
    setInspection(null);
    setError("");
    setMessage("");

    async function checkCompleteness() {
      try {
        const response = await fetch(
          "/api/exports/validate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              bookId,
              settings,
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const failure =
            await readApiFailure(response);

          throw new Error(
            failure.message
          );
        }

        const result: ExportStatus =
          await response.json();

        if (!controller.signal.aborted) {
          setStatus(result);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
        }
      }
    }

    void checkCompleteness();

    return () => {
      controller.abort();
    };
  }, [
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
    refreshVersion,
  ]);

  async function inspectEpub() {
    if (busy || !status?.ready) {
      return;
    }

    const startedFor = currentKeyRef.current;

    setInspecting(true);
    setInspection(null);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/exports/reference-report",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: requestBody,
        }
      );

      if (!response.ok) {
        const failure =
          await readApiFailure(response);

        throw new Error(
          failure.message
        );
      }

      const result: EpubIntegrityResult =
        await response.json();

      if (
        !result ||
        typeof result.valid !== "boolean" ||
        !result.report ||
        !Array.isArray(
          result.report.issues
        )
      ) {
        throw new Error(
          "Invalid EPUB integrity response"
        );
      }

      if (
        currentKeyRef.current !== startedFor
      ) {
        return;
      }

      setInspection(result);

      if (result.valid) {
        setMessage(
          "EPUB integrity check passed."
        );
      } else {
        setError(
          `EPUB integrity check found ` +
          `${result.report.totalIssues} ` +
          `issue(s). See the details below.`
        );
      }
    } catch (err) {
      if (
        currentKeyRef.current === startedFor
      ) {
        setError(getErrorMessage(err));
      }
    } finally {
      setInspecting(false);
    }
  }

  function saveIntegrityReport() {
    if (!inspection) {
      return;
    }

    const reportData = {
      bookId,
      settings,
      inspectedAt:
        new Date().toISOString(),
      valid: inspection.valid,
      ...inspection.report,
    };

    const blob = new Blob(
      [
        JSON.stringify(
          reportData,
          null,
          2
        ),
      ],
      {
        type: "application/json",
      }
    );

    downloadBlob(
      blob,
      `epub-integrity-report-${bookId}.json`
    );
  }

  async function downloadEpub() {
    if (
      busy ||
      !status?.ready ||
      !inspection?.valid
    ) {
      return;
    }

    const startedFor = currentKeyRef.current;

    setDownloading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/exports/download",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: requestBody,
        }
      );

      if (!response.ok) {
        const failure =
          await readApiFailure(response);

        if (
          failure.report &&
          currentKeyRef.current === startedFor
        ) {
          setInspection({
            valid: false,
            report: failure.report,
          });
        }

        throw new Error(
          failure.message
        );
      }

      const blob = await response.blob();

      if (
        currentKeyRef.current !== startedFor
      ) {
        return;
      }

      downloadBlob(
        blob,
        `translated-book-${bookId}.epub`
      );

      setMessage(
        "Translated EPUB downloaded."
      );
    } catch (err) {
      if (
        currentKeyRef.current === startedFor
      ) {
        setError(getErrorMessage(err));
      }
    } finally {
      setDownloading(false);
    }
  }

  const report = inspection?.report;

  return (
    <section className="epub-export-diagnostics">
      <h3>Export translated EPUB</h3>

      <p>
        Target language:{" "}
        <strong>
          {settings.targetLanguage}
        </strong>
      </p>

      {checking ? (
        <p role="status">
          Checking translation completeness...
        </p>
      ) : status ? (
        <div className="epub-export-completeness">
          <p>
            <strong>
              {status.translated} /{" "}
              {status.total}
            </strong>{" "}
            text blocks translated
          </p>

          {status.ready ? (
            <p>
              All required translations
              are available.
            </p>
          ) : (
            <p>
              {status.missing} text block(s)
              still need translating.
            </p>
          )}
        </div>
      ) : null}

      <div className="epub-export-buttons">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setRefreshVersion(
              (value) => value + 1
            );
          }}
        >
          Refresh translation status
        </button>

        <button
          type="button"
          disabled={
            busy ||
            !status?.ready
          }
          onClick={() => {
            void inspectEpub();
          }}
        >
          {inspecting
            ? "Inspecting EPUB..."
            : "Inspect EPUB integrity"}
        </button>
      </div>

      {report && (
        <div className="epub-integrity-report">
          <h4>
            {inspection?.valid
              ? "Integrity check passed"
              : "Integrity issues detected"}
          </h4>

          <div className="epub-integrity-stats">
            <p>
              <strong>
                {report.xhtmlFilesChecked}
              </strong>{" "}
              XHTML files checked
            </p>

            <p>
              <strong>
                {report.localReferencesChecked}
              </strong>{" "}
              local references checked
            </p>

            <p>
              <strong>
                {report.totalIssues}
              </strong>{" "}
              issues found
            </p>
          </div>

          {report.totalIssues > 0 && (
            <details open>
              <summary>
                View all detected issues (
                {report.totalIssues})
              </summary>

              <ol className="epub-integrity-issues">
                {report.issues.map(
                  (issue, index) => (
                    <li
                      key={`${issue.file}-${issue.reference}-${index}`}
                    >
                      <strong>
                        {issue.kind.replace(
                          /_/g,
                          " "
                        )}
                      </strong>

                      <p>
                        <strong>File:</strong>{" "}
                        <code>
                          {issue.file}
                        </code>
                      </p>

                      {issue.reference && (
                        <p>
                          <strong>
                            Reference:
                          </strong>{" "}
                          <code>
                            {issue.reference}
                          </code>
                        </p>
                      )}

                      <p>{issue.message}</p>
                    </li>
                  )
                )}
              </ol>
            </details>
          )}

          <button
            type="button"
            onClick={saveIntegrityReport}
          >
            Save full integrity report (JSON)
          </button>
        </div>
      )}

      <div className="epub-export-buttons">
        <button
          type="button"
          disabled={
            busy ||
            !status?.ready ||
            !inspection?.valid
          }
          onClick={() => {
            void downloadEpub();
          }}
        >
          {downloading
            ? "Preparing download..."
            : "Download translated EPUB"}
        </button>
      </div>

      {!inspection?.valid &&
        status?.ready && (
        <p className="epub-export-help">
          Run the integrity check before
          downloading. The download button
          becomes available once it passes.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="epub-export-error"
        >
          {error}
        </p>
      )}

      {message && (
        <p role="status">
          {message}
        </p>
      )}
    </section>
  );
}

