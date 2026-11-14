export interface TranslationOptions {
  targetLanguage: string;
  style: "literary" | "faithful";
  contextMode: "previous" | "none";
}

interface TranslationSettingsProps {
  settings: TranslationOptions;
  onChange: (settings: TranslationOptions) => void;
}

function TranslationSettings({
  settings,
  onChange,
}: TranslationSettingsProps) {
  function updateSetting<K extends keyof TranslationOptions>(
    key: K,
    value: TranslationOptions[K]
  ) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  return (
    <section>
      <h2>Translation Settings</h2>

      <div>
        <label htmlFor="target-language">
          Target Language
        </label>

        <select
          id="target-language"
          value={settings.targetLanguage}
          onChange={(event) =>
            updateSetting(
              "targetLanguage",
              event.target.value
            )
          }
        >
          <option value="French">French</option>
          <option value="Spanish">Spanish</option>
          <option value="German">German</option>
          <option value="Italian">Italian</option>
          <option value="English">English</option>
          <option value="Japanese">Japanese</option>
        </select>
      </div>

      <fieldset>
        <legend>Translation Style</legend>

        <label>
          <input
            type="radio"
            name="translation-style"
            value="literary"
            checked={settings.style === "literary"}
            onChange={() =>
              updateSetting("style", "literary")
            }
          />
          Literary
        </label>

        <label>
          <input
            type="radio"
            name="translation-style"
            value="faithful"
            checked={settings.style === "faithful"}
            onChange={() =>
              updateSetting("style", "faithful")
            }
          />
          Faithful
        </label>
      </fieldset>

      <fieldset>
        <legend>Context Handling</legend>

        <label>
          <input
            type="radio"
            name="context-mode"
            value="previous"
            checked={settings.contextMode === "previous"}
            onChange={() =>
              updateSetting("contextMode", "previous")
            }
          />
          Use previous chapters
        </label>

        <label>
          <input
            type="radio"
            name="context-mode"
            value="none"
            checked={settings.contextMode === "none"}
            onChange={() =>
              updateSetting("contextMode", "none")
            }
          />
          No additional context
        </label>
      </fieldset>
    </section>
  );
}

export default TranslationSettings;
