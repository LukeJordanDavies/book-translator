import test from "node:test";
import assert from "node:assert/strict";

import {
  reviewTranslatedContent,
} from "../services/translationContentReviewService.js";

function kinds(
  source: string,
  target: string,
  language = "French"
) {
  return reviewTranslatedContent(
    source,
    target,
    language
  ).map((finding) => finding.kind);
}

test("accepts ordinary translations", () => {
  assert.deepEqual(
    kinds(
      "The captain arrived at sunset.",
      "Le capitaine arriva au coucher du soleil."
    ),
    []
  );
});

test("detects changed numbers", () => {
  const result = kinds(
    "The ship carried 12 passengers and arrived in 1847.",
    "Le navire transportait 13 passagers et arriva en 1847."
  );

  assert.ok(
    result.includes("number_mismatch")
  );
});

test("allows common number separator differences", () => {
  const result = kinds(
    "The sum was 1,500.",
    "Le total était de 1.500."
  );

  assert.ok(
    !result.includes("number_mismatch")
  );
});

test("ignores formatting marker IDs", () => {
  assert.deepEqual(
    kinds(
      "[[OPEN_42]]The night was cold.",
      "[[CLOSE_1]]La nuit était froide."
    ),
    []
  );
});

test("flags unusually short long passages", () => {
  const source =
    "The lantern flickered beside the old stone tower. "
      .repeat(8);

  const target =
    "La lanterne tremblait près de la tour. "
      .repeat(4);

  assert.ok(
    kinds(source, target).includes(
      "possible_omission"
    )
  );
});

test("flags excessively expanded passages", () => {
  const source =
    "The path led to the village at dawn. "
      .repeat(7);

  const target =
    (
      "Le chemin menait au village, alors " +
      "que le soleil éclairait " +
      "progressivement les collines. "
    ).repeat(9);

  assert.ok(
    kinds(source, target).includes(
      "possible_addition"
    )
  );
});

test("flags new adjacent sentence duplication", () => {
  const source =
    "The captain closed the heavy iron " +
    "gate and looked away.";

  const target =
    "Le capitaine referma soigneusement " +
    "la lourde grille de fer. " +
    "Le capitaine referma soigneusement " +
    "la lourde grille de fer.";

  assert.ok(
    kinds(source, target).includes(
      "repeated_translation"
    )
  );
});

test("does not flag repetition already present in source", () => {
  const source =
    "The captain closed the heavy iron gate. " +
    "The captain closed the heavy iron gate.";

  const target =
    "Le capitaine referma soigneusement " +
    "la lourde grille de fer. " +
    "Le capitaine referma soigneusement " +
    "la lourde grille de fer.";

  assert.ok(
    !kinds(source, target).includes(
      "repeated_translation"
    )
  );
});

test("skips length heuristics for Japanese", () => {
  const source =
    "The lantern flickered beside the old stone tower. "
      .repeat(8);

  const target =
    "灯台のそばに明かりが見えた。";

  assert.ok(
    !kinds(
      source,
      target,
      "Japanese"
    ).includes("possible_omission")
  );
});
