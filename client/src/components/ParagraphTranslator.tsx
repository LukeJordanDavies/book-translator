import { useState } from "react";

import type {
  TranslationOptions,
} from "./TranslationSettings";

interface ParagraphTranslatorProps {
  text: string;
  settings: TranslationOptions;
}

function ParagraphTranslator({
  text,
  settings,
}: ParagraphTranslatorProps) {
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleTranslate() {
    setLoading(true);
    setError("");
    setTranslation("");

    try {
      const response = await fetch("/api/translations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
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

      <button
        type="button"
        onClick={handleTranslate}
        disabled={loading || text.length > 3000}
      >
        {loading ? "Translating..." : "Translate Paragraph"}
      </button>

      {text.length > 3000 && (
        <p>This paragraph exceeds the 3000-character limit.</p>
      )}

      {error && <p role="alert">{error}</p>}

      {translation && (
        <div>
          <h4>Translation</h4>
          <p>{translation}</p>
        </div>
      )}
    </section>
  );
}

export default ParagraphTranslator;
