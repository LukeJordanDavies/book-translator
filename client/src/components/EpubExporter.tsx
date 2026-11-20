import { useEffect, useState } from "react";
import type {
  TranslationOptions,
} from "./TranslationSettings";

interface EpubExporterProps {
  bookId: number;
  settings: TranslationOptions;
}

interface ExportStatus {
  ready: boolean;
  total: number;
  translated: number;
  missing: number;
}

export default function EpubExporter({
  bookId,
  settings,
}: EpubExporterProps) {
  const [status, setStatus] =
    useState<ExportStatus | null>(null);

  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] =
    useState(false);

  const [error, setError] = useState("");

  async function checkReadiness(
    signal?: AbortSignal
  ) {
    setChecking(true);
    setError("");

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
          signal,
        }
      );

      if (!response.ok) {
        throw new Error(
          "Could not check EPUB export readiness"
        );
      }

      const result: ExportStatus =
        await response.json();

      if (!signal?.aborted) {
        setStatus(result);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === "AbortError"
      ) {
        return;
      }

      if (!signal?.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : "Unknown error"
        );
      }
    } finally {
      if (!signal?.aborted) {
        setChecking(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    setStatus(null);
    void checkReadiness(controller.signal);

    return () => controller.abort();
  }, [
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
  ]);

  async function downloadEpub() {
    if (!status?.ready || downloading) {
      return;
    }

    setDownloading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/exports/download",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookId,
            settings,
          }),
        }
      );

      if (!response.ok) {
        const result = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          result.error ??
            "EPUB download failed"
        );
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;
      link.download =
        `translated-book-${bookId}.epub`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown error"
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="epub-exporter">
      <h3>Export translated EPUB</h3>

      <button
        type="button"
        onClick={() => void checkReadiness()}
        disabled={checking || downloading}
      >
        {checking
          ? "Checking..."
          : "Refresh export status"}
      </button>

      {status && (
        <div className="export-status">
          <p>
            Translated text blocks:{" "}
            {status.translated} / {status.total}
          </p>

          <p>
            Remaining: {status.missing}
          </p>

          {status.ready ? (
            <p>Ready to export.</p>
          ) : (
            <p>
              Complete the remaining headings and
              paragraphs before exporting.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void downloadEpub()}
        disabled={
          !status?.ready ||
          checking ||
          downloading
        }
      >
        {downloading
          ? "Generating EPUB..."
          : "Download Translated EPUB"}
      </button>

      {error && (
        <p role="alert" className="export-error">
          {error}
        </p>
      )}
    </section>
  );
}
