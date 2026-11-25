import test from "node:test";
import assert from "node:assert/strict";

import type {
  GlossaryEntry,
} from "../database/glossaryRepository.js";

import {
  selectRelevantGlossaryEntries,
  formatGlossaryForPrompt,
} from "../services/glossaryContextService.js";

function makeEntry(
  id: number,
  sourceTerm: string,
  translatedTerm: string
): GlossaryEntry {
  return {
    id,
    bookId: 15,
    targetLanguage: "French",
    sourceTerm,
    translatedTerm,
    category: "term",
    notes: "",
    createdAt: "",
    updatedAt: "",
  };
}

test("selects glossary terms found in a passage", () => {
  const entries = [
    makeEntry(
      1,
      "The Silver Vale",
      "La Vallée Argentée"
    ),
    makeEntry(
      2,
      "Wardstone",
      "Pierre de garde"
    ),
  ];

  const result = selectRelevantGlossaryEntries(
    "Mira entered the Silver Vale.",
    entries
  );

  assert.equal(result.length, 1);
  assert.equal(
    result[0].sourceTerm,
    "The Silver Vale"
  );
});

test("does not match terms inside longer words", () => {
  const entries = [
    makeEntry(1, "Mira", "Mira"),
  ];

  const result = selectRelevantGlossaryEntries(
    "Mirabel walked into the forest.",
    entries
  );

  assert.equal(result.length, 0);
});

test("handles special regex characters in terms", () => {
  const entries = [
    makeEntry(1, "A+B", "A plus B"),
  ];

  const result = selectRelevantGlossaryEntries(
    "He discovered A+B.",
    entries
  );

  assert.equal(result.length, 1);
});

test("matches terms across formatting markers", () => {
  const entries = [
    makeEntry(
      1,
      "The Silver Vale",
      "La Vallée Argentée"
    ),
  ];

  const result = selectRelevantGlossaryEntries(
    "Beyond lay The [[OPEN_1]]Silver" +
    "[[CLOSE_1]] Vale.",
    entries
  );

  assert.equal(result.length, 1);
});

test("prioritises longer terms when limiting results", () => {
  const entries = [
    makeEntry(1, "Mira", "Mira"),
    makeEntry(2, "Wardstone", "Pierre de garde"),
    makeEntry(
      3,
      "The Silver Vale",
      "La Vallée Argentée"
    ),
  ];

  const result = selectRelevantGlossaryEntries(
    "Mira carried a Wardstone into " +
    "The Silver Vale.",
    entries,
    2
  );

  assert.equal(result.length, 2);

  assert.deepEqual(
    result.map((entry) => entry.sourceTerm),
    ["The Silver Vale", "Wardstone"]
  );
});

test("formats glossary entries as structured data", () => {
  const entries = [
    makeEntry(
      1,
      "Wardstone",
      "Pierre de garde"
    ),
  ];

  const context = formatGlossaryForPrompt(
    entries
  );

  assert.match(
    context,
    /Reference glossary/
  );

  const jsonLine = context.split("\n")[1];

  const data = JSON.parse(jsonLine) as Array<{
    source: string;
    preferredTranslation: string;
  }>;

  assert.equal(
    data[0].source,
    "Wardstone"
  );

  assert.equal(
    data[0].preferredTranslation,
    "Pierre de garde"
  );

  assert.equal(
    formatGlossaryForPrompt([]),
    ""
  );
});
