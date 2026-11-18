import { useEffect, useState } from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

interface ParagraphTranslatorProps {
  blockId: number;
  text: string;
  settings: TranslationOptions;
}

function ParagraphTranslator({
  blockId,
  text,
  settings,
}: ParagraphTranslatorProps) {
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);

  const {
    targetLanguage,
    style,
    contextMode,
  } = settings;

  useEffect(() => {
    const controller = new AbortController();

    async function loadSavedTranslation() {
      setChecking(true);
      setTranslation("");
      setError("");
      setCached(false);

      const params = new URLSearchParams({
        targetLanguage,
        style,
        contextMode,
      });

      try {
        const response = await fetch(
          `/api/translations/${blockId}?${params}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Failed to check saved translation");
        }

        const data = await response.json();

        if (!controller.signal.aborted && data.translation) {
          setTranslation(data.translation.translated_text);
          setCached(true);
        }
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
          setChecking(false);
        }
      }
    }

    loadSavedTranslation();

    return () => controller.abort();
  }, [blockId, targetLanguage, style, contextMode]);

  async function handleTranslate() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/translations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          blockId,
          settings,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Translation failed"
        );
      }

      setTranslation(data.translatedText);
      setCached(data.cached);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h3>Paragraph Translation</h3>

      <h4>Original</h4>
      <p>{text}</p>

      {checking && <p>Checking saved translations...</p>}

      {!checking && (
        <button
          type="button"
          onClick={handleTranslate}
          disabled={loading || text.length > 3000}
        >
          {loading
            ? "Translating..."
            : translation
              ? "Load Translation"
              : "Translate Paragraph"}
        </button>
      )}

      {error && <p role="alert">{error}</p>}

      {translation && (
        <div>
          <h4>Translation</h4>
          <p>{translation}</p>

          {cached && (
            <small>Loaded from saved translations</small>
          )}
        </div>
      )}
    </section>
  );
}

export default ParagraphTranslator;
