import test from "node:test";
import assert from "node:assert/strict";

import {
  containsLikelyDialogue,
  getDialogueTranslationGuidance,
} from "../services/dialogueTranslationPrompt.js";

test("detects dialogue with quotation marks", () => {
  assert.equal(
    containsLikelyDialogue(
      '"You are late," she said.'
    ),
    true
  );

  assert.equal(
    containsLikelyDialogue(
      '“I came as quickly as I could.”'
    ),
    true
  );
});

test("recognises other quotation styles", () => {
  assert.equal(
    containsLikelyDialogue(
      "« Où étais-tu ? » demanda-t-elle."
    ),
    true
  );

  assert.equal(
    containsLikelyDialogue(
      "‘Are you ready?’ he asked."
    ),
    true
  );
});

test("detects dialogue introduced by dashes", () => {
  const passage =
    "The captain looked at the crew.\n" +
    "— Where is the map?\n" +
    "— I left it below deck.";

  assert.equal(
    containsLikelyDialogue(passage),
    true
  );
});

test("does not mistake ordinary prose for dialogue", () => {
  assert.equal(
    containsLikelyDialogue(
      "The rain fell throughout the night."
    ),
    false
  );

  assert.equal(
    containsLikelyDialogue(
      "Thomas didn't know where she'd gone."
    ),
    false
  );
});

test("detects dialogue around formatting markers", () => {
  const passage =
    '[[OPEN_1]]“Come closer,” she whispered.' +
    '[[CLOSE_1]]';

  assert.equal(
    containsLikelyDialogue(passage),
    true
  );
});

test("provides literary dialogue guidance", () => {
  const guidance =
    getDialogueTranslationGuidance(
      '"You took your time," she said.',
      "literary"
    );

  assert.match(
    guidance,
    /DIALOGUE STYLE: LITERARY/
  );

  assert.match(
    guidance,
    /natural, believable/
  );

  assert.match(
    guidance,
    /Do not combine, omit or invent dialogue/
  );
});

test("provides faithful dialogue guidance", () => {
  const guidance =
    getDialogueTranslationGuidance(
      '"You took your time," she said.',
      "faithful"
    );

  assert.match(
    guidance,
    /DIALOGUE STYLE: FAITHFUL/
  );

  assert.match(
    guidance,
    /accurate reproduction/
  );

  assert.doesNotMatch(
    guidance,
    /DIALOGUE STYLE: LITERARY/
  );
});

test("does not change source text or add unnecessary guidance", () => {
  const original =
    '[[OPEN_1]]“Wait!”[[CLOSE_1]]';

  const before = original;

  getDialogueTranslationGuidance(
    original,
    "literary"
  );

  assert.equal(original, before);

  assert.equal(
    getDialogueTranslationGuidance(
      "A peaceful morning arrived.",
      "literary"
    ),
    ""
  );
});
