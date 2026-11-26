export type DialogueTranslationStyle =
  | "literary"
  | "faithful";

// Detect common quotation styles.
//
// These include straight double quotes,
// typographic double/single quotes and
// French guillemets.
const QUOTED_DIALOGUE =
  /(?:“[^”\r\n]+”|"[^"\r\n]+"|‘[^’\r\n]+’|«[^»\r\n]+»)/u;

// Detect dialogue lines beginning with
// an em dash or en dash.
//
// Example:
// — Where have you been?
const DASH_DIALOGUE =
  /(?:^|\r?\n)[ \t]*[—–][ \t]+\S/u;

// Formatting markers should not interfere
// with dialogue detection.
const FORMATTING_MARKER =
  /\[\[(?:OPEN|CLOSE|SELF)_\d+\]\]/gu;

export function containsLikelyDialogue(
  text: string
): boolean {
  const cleaned = text.replace(
    FORMATTING_MARKER,
    ""
  );

  return (
    QUOTED_DIALOGUE.test(cleaned) ||
    DASH_DIALOGUE.test(cleaned)
  );
}

const SHARED_DIALOGUE_GUIDANCE = `
ADDITIONAL DIALOGUE TRANSLATION REQUIREMENTS:

1. Preserve every spoken line and speaking turn.
   Do not combine, omit or invent dialogue.

2. Preserve who is speaking and which dialogue
   tags or descriptions belong to each speaker.

3. Keep the intended meaning, emotional tone
   and implied relationships between speakers.

4. Preserve differences in vocabulary,
   politeness, formality and speech patterns
   between characters.

5. Preserve questions, hesitation, uncertainty,
   irony, sarcasm, humour and interruptions
   when present in the original.

6. Preserve meaningful pauses, ellipses,
   unfinished sentences and abrupt cut-offs.

7. Use natural dialogue punctuation and
   quotation conventions for the target
   language, without changing the number
   or order of speaking turns.

8. Do not invent regional dialect, slang,
   contractions, stutters or verbal habits
   that are absent from the original.

9. Translate speech attribution naturally.
   Keep the correct speaker associated
   with each spoken line.

10. Preserve all formatting placeholders,
    XHTML-related markers and structural
    markers exactly as supplied.

11. Do not add commentary, explanations
    or speaker labels to the translation.

12. Preserve the complete original meaning,
    including any narration surrounding
    the dialogue.
`.trim();

const LITERARY_DIALOGUE_GUIDANCE = `
DIALOGUE STYLE: LITERARY

Translate dialogue as natural, believable
conversation in the target language.

Maintain the author's characterisation,
rhythm, subtext and conversational tone.

Use idiomatic expressions where appropriate,
but do not add meaning or change the
characters' personalities.

Allow natural target-language sentence
structures where literal wording would
sound awkward.

Do not make all characters sound alike.
`.trim();

const FAITHFUL_DIALOGUE_GUIDANCE = `
DIALOGUE STYLE: FAITHFUL

Prioritise accurate reproduction of
the original dialogue.

Preserve register, implied meaning,
word choices and sentence structure
where natural in the target language.

Avoid unnecessary stylistic changes.

Use grammatically correct dialogue
rather than forcing unnatural literal
wording.
`.trim();

export function getDialogueTranslationGuidance(
  text: string,
  style: DialogueTranslationStyle
): string {
  if (!containsLikelyDialogue(text)) {
    return "";
  }

  if (style === "literary") {
    return [
      SHARED_DIALOGUE_GUIDANCE,
      LITERARY_DIALOGUE_GUIDANCE,
    ].join("\n\n");
  }

  return [
    SHARED_DIALOGUE_GUIDANCE,
    FAITHFUL_DIALOGUE_GUIDANCE,
  ].join("\n\n");
}
