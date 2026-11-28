import test from "node:test";
import assert from "node:assert/strict";

import { literaryCases } from "./fixtures/literaryCases.js";
import { getTranslationStyleGuidance } from "../services/translationStylePrompt.js";
import {
  containsLikelyDialogue,
  getDialogueTranslationGuidance,
} from "../services/dialogueTranslationPrompt.js";
import { reviewTranslatedContent } from "../services/translationContentReviewService.js";
import { improveLiterarySegments } from "../services/literarySegmentationService.js";

function getCase(id: string) {
  const item = literaryCases.find((entry) => entry.id === id);
  assert.ok(item, `Missing literary fixture: ${id}`);
  return item;
}

test("literary corpus has distinct complete test cases", () => {
  assert.equal(literaryCases.length, 9);
  assert.equal(new Set(literaryCases.map((c) => c.id)).size, literaryCases.length);

  for (const item of literaryCases) {
    assert.ok(item.source.trim(), item.id);
    assert.ok(item.frenchReference.trim(), item.id);
    assert.ok(item.reviewQuestions.length >= 2, item.id);
  }
});

test("corpus covers the planned translation challenges", () => {
  const categories = new Set(literaryCases.map((item) => item.category));

  for (const category of [
    "dialogue", "idiom", "description", "subtext", "register",
    "numbers", "formatting", "continuity", "ambiguity",
  ]) {
    assert.ok(categories.has(category as typeof literaryCases[number]["category"]), category);
  }
});

test("dialogue and polite-register fixtures activate dialogue guidance", () => {
  for (const id of ["dialogue-turns", "formal-register", "ironic-subtext"]) {
    const item = getCase(id);
    assert.equal(containsLikelyDialogue(item.source), true);
    assert.match(
      getDialogueTranslationGuidance(item.source, "literary"),
      /DIALOGUE STYLE: LITERARY/
    );
  }
});

test("ordinary descriptive prose does not activate dialogue guidance", () => {
  const item = getCase("imagery-tone");
  assert.equal(containsLikelyDialogue(item.source), false);
  assert.equal(getDialogueTranslationGuidance(item.source, "literary"), "");
});

test("literary and faithful instructions both forbid omitted content", () => {
  for (const style of ["literary", "faithful"] as const) {
    const prompt = getTranslationStyleGuidance(style);
    assert.match(prompt, /Do not omit sentences/i);
    assert.match(prompt, /Do not invent details/i);
    assert.match(prompt, /formatting placeholders/i);
  }
});

test("both translation modes preserve distinct style guidance", () => {
  assert.match(getTranslationStyleGuidance("literary"), /TRANSLATION STYLE: LITERARY/);
  assert.match(getTranslationStyleGuidance("faithful"), /TRANSLATION STYLE: FAITHFUL/);
  assert.notEqual(
    getTranslationStyleGuidance("literary"),
    getTranslationStyleGuidance("faithful")
  );
});

test("illustrative French references retain all digit-based facts", () => {
  for (const item of literaryCases) {
    const findings = reviewTranslatedContent(item.source, item.frenchReference, "French");
    assert.ok(
      !findings.some((finding) => finding.kind === "number_mismatch"),
      `Unexpected number warning in ${item.id}`
    );
  }
});

test("changing a historical year produces a review warning", () => {
  const item = getCase("numerical-facts");
  const altered = item.frenchReference.replace("1847", "1849");
  const findings = reviewTranslatedContent(item.source, altered, "French");
  assert.ok(findings.some((finding) => finding.kind === "number_mismatch"));
});

test("removing a quantity produces a review warning", () => {
  const item = getCase("numerical-facts");
  const altered = item.frenchReference.replace("12", "");
  const findings = reviewTranslatedContent(item.source, altered, "French");
  assert.ok(findings.some((finding) => finding.kind === "number_mismatch"));
});

test("new adjacent sentence duplication produces a review warning", () => {
  const source = "The captain closed the heavy iron gate and went inside.";
  const sentence = "Le capitaine referma soigneusement la lourde grille de fer.";
  const findings = reviewTranslatedContent(source, `${sentence} ${sentence}`, "French");
  assert.ok(findings.some((finding) => finding.kind === "repeated_translation"));
});

test("formatting marker boundaries use the existing safe segments", () => {
  const segments = [
    "[[OPEN_1]]He promised to ",
    "return before winter[[CLOSE_1]]",
  ];
  assert.deepEqual(improveLiterarySegments(segments), segments);
});

test("long-passage boundary improvement preserves every source character", () => {
  const source = Array.from(
    { length: 110 },
    (_, i) =>
      `At the ${i + 1}th turning, Mara stopped to study the shoreline. ` +
      "The sea was calm, but the path ahead was uncertain. "
  ).join("");

  const original: string[] = [];
  for (let i = 0; i < source.length; i += 3000) {
    original.push(source.slice(i, i + 3000));
  }
  const improved = improveLiterarySegments(original);

  assert.equal(improved.join(""), source);
  assert.ok(improved.every((segment) => segment.length <= 3000));
  assert.ok(improved.length <= original.length + 1);
});

test("review examples do not incorrectly flag adjacent repeated sentences", () => {
  for (const item of literaryCases) {
    const findings = reviewTranslatedContent(item.source, item.frenchReference, "French");
    assert.ok(
      !findings.some((finding) => finding.kind === "repeated_translation"),
      `Unexpected repetition warning in ${item.id}`
    );
  }
});
