import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import "./GlossaryEditor.css";

type GlossaryCategory =
  | "character"
  | "place"
  | "term";

interface GlossaryEntry {
  id: number;
  bookId: number;
  targetLanguage: string;
  sourceTerm: string;
  translatedTerm: string;
  category: GlossaryCategory;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface GlossaryForm {
  sourceTerm: string;
  translatedTerm: string;
  category: GlossaryCategory;
  notes: string;
}

interface GlossaryEditorProps {
  bookId: number;
  targetLanguage: string;
}

const EMPTY_FORM: GlossaryForm = {
  sourceTerm: "",
  translatedTerm: "",
  category: "term",
  notes: "",
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred";
}

export default function GlossaryEditor({
  bookId,
  targetLanguage,
}: GlossaryEditorProps) {
  const [entries, setEntries] = useState<
    GlossaryEntry[]
  >([]);

  const [form, setForm] =
    useState<GlossaryForm>(EMPTY_FORM);

  const [editingId, setEditingId] =
    useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] =
    useState<number | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const busy = loading || saving ||
    deletingId !== null;

  // Reset the editor when the selected book
  // or target language changes.
  useEffect(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError("");
    setMessage("");
    setEntries([]);
  }, [bookId, targetLanguage]);

  // Retrieve the saved glossary from SQLite
  // through the existing Express API.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadGlossary() {
      setLoading(true);

      try {
        const params = new URLSearchParams({
          targetLanguage,
        });

        const response = await fetch(
          `/api/books/${bookId}/glossary?${params}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            await getApiError(response)
          );
        }

        const data: {
          entries: GlossaryEntry[];
        } = await response.json();

        if (!Array.isArray(data.entries)) {
          throw new Error(
            "Invalid glossary response"
          );
        }

        if (active) {
          setEntries(data.entries);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadGlossary();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    bookId,
    targetLanguage,
    refreshVersion,
  ]);

  function updateField<K extends keyof GlossaryForm>(
    field: K,
    value: GlossaryForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEditing(entry: GlossaryEntry) {
    setEditingId(entry.id);

    setForm({
      sourceTerm: entry.sourceTerm,
      translatedTerm: entry.translatedTerm,
      category: entry.category,
      notes: entry.notes,
    });

    setError("");
    setMessage("");
  }

  async function saveEntry(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) {
      return;
    }

    if (
      !form.sourceTerm.trim() ||
      !form.translatedTerm.trim()
    ) {
      setError(
        "Both the original and translated terms are required."
      );
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/books/${bookId}/glossary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetLanguage,
            sourceTerm: form.sourceTerm.trim(),
            translatedTerm:
              form.translatedTerm.trim(),
            category: form.category,
            notes: form.notes.trim(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          await getApiError(response)
        );
      }

      setMessage(
        editingId === null
          ? "Glossary entry saved."
          : "Glossary entry updated."
      );

      resetForm();

      // Reload the entries from the database.
      setRefreshVersion(
        (current) => current + 1
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(
    entry: GlossaryEntry
  ) {
    if (busy) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${entry.sourceTerm}" from the glossary?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(entry.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/books/${bookId}/glossary/${entry.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(
          await getApiError(response)
        );
      }

      if (editingId === entry.id) {
        resetForm();
      }

      setMessage(
        `"${entry.sourceTerm}" was deleted.`
      );

      setRefreshVersion(
        (current) => current + 1
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="glossary-editor">
      <header className="glossary-header">
        <h3>Translation glossary</h3>

        <p>
          Manage preferred terminology for{" "}
          <strong>{targetLanguage}</strong>.
        </p>
      </header>

      <p className="glossary-notice">
        Changes affect future translations,
        not text that has already been translated.
        Pause any active translation job before
        editing the glossary.
      </p>

      <form
        className="glossary-form"
        onSubmit={(event) => {
          void saveEntry(event);
        }}
      >
        <h4>
          {editingId === null
            ? "Add a glossary entry"
            : "Edit glossary entry"}
        </h4>

        <div className="glossary-form-grid">
          <div className="glossary-field">
            <label htmlFor="glossary-source">
              Original term
            </label>

            <input
              id="glossary-source"
              type="text"
              value={form.sourceTerm}
              onChange={(event) =>
                updateField(
                  "sourceTerm",
                  event.target.value
                )
              }
              placeholder="The Silver Vale"
              maxLength={120}
              readOnly={editingId !== null}
              required
            />
          </div>

          <div className="glossary-field">
            <label htmlFor="glossary-translation">
              Preferred translation
            </label>

            <input
              id="glossary-translation"
              type="text"
              value={form.translatedTerm}
              onChange={(event) =>
                updateField(
                  "translatedTerm",
                  event.target.value
                )
              }
              placeholder="La Vallée Argentée"
              maxLength={120}
              required
            />
          </div>

          <div className="glossary-field">
            <label htmlFor="glossary-category">
              Category
            </label>

            <select
              id="glossary-category"
              value={form.category}
              onChange={(event) =>
                updateField(
                  "category",
                  event.target.value as GlossaryCategory
                )
              }
            >
              <option value="character">
                Character
              </option>

              <option value="place">
                Place
              </option>

              <option value="term">
                General term
              </option>
            </select>
          </div>

          <div className="glossary-field">
            <label htmlFor="glossary-notes">
              Notes (optional)
            </label>

            <textarea
              id="glossary-notes"
              value={form.notes}
              onChange={(event) =>
                updateField(
                  "notes",
                  event.target.value
                )
              }
              placeholder="Use consistently throughout the book."
              maxLength={300}
              rows={3}
            />
          </div>
        </div>

        {editingId !== null && (
          <p className="glossary-help">
            To change an original term, delete
            the old entry and create a new one.
          </p>
        )}

        <div className="glossary-actions">
          <button
            type="submit"
            disabled={busy}
          >
            {saving
              ? "Saving..."
              : editingId === null
                ? "Add entry"
                : "Save changes"}
          </button>

          {editingId !== null && (
            <button
              type="button"
              onClick={resetForm}
              disabled={busy}
            >
              Cancel editing
            </button>
          )}
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="glossary-error"
        >
          {error}
        </p>
      )}

      {message && (
        <p
          role="status"
          className="glossary-success"
        >
          {message}
        </p>
      )}

      <div className="glossary-list">
        <h4>
          Saved entries ({entries.length})
        </h4>

        {loading ? (
          <p>Loading glossary...</p>
        ) : entries.length === 0 ? (
          <p>
            No glossary entries for{" "}
            {targetLanguage} yet.
          </p>
        ) : (
          <div className="glossary-table-wrapper">
            <table className="glossary-table">
              <thead>
                <tr>
                  <th>Original</th>
                  <th>Translation</th>
                  <th>Category</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>
                        {entry.sourceTerm}
                      </strong>

                      {entry.notes && (
                        <p className="glossary-entry-notes">
                          {entry.notes}
                        </p>
                      )}
                    </td>

                    <td>
                      {entry.translatedTerm}
                    </td>

                    <td>
                      {entry.category}
                    </td>

                    <td>
                      <div className="glossary-row-actions">
                        <button
                          type="button"
                          onClick={() =>
                            startEditing(entry)
                          }
                          disabled={busy}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="glossary-delete"
                          onClick={() => {
                            void deleteEntry(entry);
                          }}
                          disabled={busy}
                        >
                          {deletingId === entry.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
