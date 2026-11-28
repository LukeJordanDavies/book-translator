export type LiteraryCategory =
  | "dialogue"
  | "idiom"
  | "description"
  | "subtext"
  | "register"
  | "numbers"
  | "formatting"
  | "continuity"
  | "ambiguity";

export interface LiteraryCase {
  id: string;
  title: string;
  category: LiteraryCategory;
  source: string;
  /** A discussion reference, not the one correct translation. */
  frenchReference: string;
  reviewQuestions: string[];
  /** Optional source markup for the generated test EPUB. */
  sourceXhtml?: string;
  previousContext?: string;
}

/**
 * Original passages written solely for testing this translator.
 * These examples are NOT strict golden outputs for OpenAI.
 * Literary quality still requires human evaluation.
 */
export const literaryCases: LiteraryCase[] = [
  {
    id: "dialogue-turns",
    title: "Dialogue and speaking turns",
    category: "dialogue",
    source:
      '"You took your time," Margaret said.\n\n' +
      '"The bridge was closed," Thomas replied.\n\n' +
      '"Of course it was."',
    frenchReference:
      '« Tu en as mis du temps », dit Margaret.\n\n' +
      '« Le pont était fermé », répondit Thomas.\n\n' +
      '« Évidemment. »',
    reviewQuestions: [
      "Are there exactly three speaking turns in the same order?",
      "Are the speech attributions and dry tone preserved?",
    ],
  },
  {
    id: "idiom-meaning",
    title: "Idiom without literal wording",
    category: "idiom",
    source:
      "By midnight, Margaret knew she had bitten off more than she could chew, " +
      "but she refused to admit it.",
    frenchReference:
      "À minuit, Margaret comprit qu'elle avait vu trop grand, " +
      "mais elle refusait de l'admettre.",
    reviewQuestions: [
      "Does the idiom convey being overcommitted, not physically eating?",
      "Is Margaret's refusal to admit it retained?",
    ],
  },
  {
    id: "imagery-tone",
    title: "Imagery, rhythm and atmosphere",
    category: "description",
    source:
      "The harbour bells drifted through the fog, faint as memories. " +
      "Across the dark water, a single window glowed while the town slept.",
    frenchReference:
      "Les cloches du port traversaient la brume, lointaines comme des souvenirs. " +
      "De l'autre côté de l'eau sombre, une seule fenêtre brillait tandis que la ville dormait.",
    reviewQuestions: [
      "Are the fog, bells, water, window and sleeping town all present?",
      "Is the quiet atmosphere preserved without additional imagery?",
    ],
  },
  {
    id: "ironic-subtext",
    title: "Irony and implied meaning",
    category: "subtext",
    source:
      '"A wonderful plan," she said, staring at the flooded road.',
    frenchReference:
      '« Un plan merveilleux », dit-elle en contemplant la route inondée.',
    reviewQuestions: [
      "Does the context still permit an ironic reading?",
      "Has the translator avoided adding 'sarcastically' or other explanations?",
    ],
  },
  {
    id: "formal-register",
    title: "Politeness and social register",
    category: "register",
    source:
      '"Would you be so kind as to close the door?" the professor asked.',
    frenchReference:
      '« Auriez-vous l’amabilité de fermer la porte ? » demanda le professeur.',
    reviewQuestions: [
      "Does the request remain polite rather than commanding?",
      "Is the professor still the speaker?",
    ],
  },
  {
    id: "numerical-facts",
    title: "Dates and quantities",
    category: "numbers",
    source:
      "In 1847, the ship carried 12 passengers and 3 sealed letters.",
    frenchReference:
      "En 1847, le navire transportait 12 passagers et 3 lettres cachetées.",
    reviewQuestions: [
      "Are the year and both quantities unchanged?",
      "Are the passengers and letters correctly associated with their numbers?",
    ],
  },
  {
    id: "inline-formatting",
    title: "Italic emphasis within a passage",
    category: "formatting",
    source:
      "He promised to return before winter, yet spring arrived first.",
    sourceXhtml:
      "He promised to <em>return before winter</em>, yet spring arrived first.",
    frenchReference:
      "Il promit de revenir avant l'hiver, mais le printemps arriva le premier.",
    reviewQuestions: [
      "Does the translated EPUB retain one italic span in the corresponding phrase?",
      "Is the promise and the passage of time retained?",
    ],
  },
  {
    id: "continuity-glossary",
    title: "Names and previous-chapter context",
    category: "continuity",
    source:
      "Mira crossed The Silver Vale again. No one spoke of the missing map.",
    frenchReference:
      "Mira traversa de nouveau le Val Argenté. Personne ne parla de la carte disparue.",
    previousContext:
      "The companions lost their map the previous evening. Mira was guiding them home.",
    reviewQuestions: [
      "Is Mira consistently named and the Silver Vale translated using the glossary?",
      "Is the missing map correctly understood without inventing an explanation?",
    ],
  },
  {
    id: "deliberate-ambiguity",
    title: "Ambiguity and restraint",
    category: "ambiguity",
    source:
      "She watched him leave and wondered whether the silence was an answer.",
    frenchReference:
      "Elle le regarda partir et se demanda si le silence était une réponse.",
    reviewQuestions: [
      "Does the uncertainty remain unresolved?",
      "Is there no invented account of his intentions or feelings?",
    ],
  },
];
