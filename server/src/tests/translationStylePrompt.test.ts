import test from "node:test";
import assert from "node:assert/strict";

import {
  getTranslationStyleGuidance,
} from "../services/translationStylePrompt.js";

test("literary mode prioritises natural prose", () => {
  const prompt = getTranslationStyleGuidance(
    "literary"
  );

  assert.match(
    prompt,
    /natural, polished literary prose/i
  );

  assert.match(
    prompt,
    /idiomatic phrasing/i
  );

  assert.match(
    prompt,
    /narrative voice/i
  );
});

test("faithful mode prioritises accuracy", () => {
  const prompt = getTranslationStyleGuidance(
    "faithful"
  );

  assert.match(
    prompt,
    /precision and completeness/i
  );

  assert.match(
    prompt,
    /original sentence structure/i
  );

  assert.match(
    prompt,
    /accurate equivalents/i
  );
});

test("both modes prohibit invented content", () => {
  for (const style of [
    "literary",
    "faithful",
  ] as const) {
    const prompt = getTranslationStyleGuidance(
      style
    );

    assert.match(
      prompt,
      /Do not invent details/i
    );

    assert.match(
      prompt,
      /Do not omit sentences/i
    );
  }
});

test("both modes protect formatting markers", () => {
  for (const style of [
    "literary",
    "faithful",
  ] as const) {
    const prompt = getTranslationStyleGuidance(
      style
    );

    assert.match(
      prompt,
      /Preserve formatting placeholders/i
    );

    assert.match(
      prompt,
      /Never\s+translate,\s+remove,\s+duplicate/i
    );
  }
});

test("literary and faithful prompts differ", () => {
  const literary = getTranslationStyleGuidance(
    "literary"
  );

  const faithful = getTranslationStyleGuidance(
    "faithful"
  );

  assert.notEqual(
    literary,
    faithful
  );

  assert.match(
    literary,
    /TRANSLATION STYLE: LITERARY/
  );

  assert.match(
    faithful,
    /TRANSLATION STYLE: FAITHFUL/
  );
});

test("rejects an unsupported style", () => {
  assert.throws(
    () =>
      getTranslationStyleGuidance(
        "unknown" as "literary"
      ),
    /Unsupported translation style/
  );
});
