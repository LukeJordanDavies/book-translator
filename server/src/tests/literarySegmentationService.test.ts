import test from "node:test";
import assert from "node:assert/strict";

import {
  improveLiterarySegments,
} from "../services/literarySegmentationService.js";

function fixedSegments(
  text: string,
  maxLength: number
): string[] {
  const result: string[] = [];

  for (
    let i = 0;
    i < text.length;
    i += maxLength
  ) {
    result.push(
      text.slice(
        i,
        i + maxLength
      )
    );
  }

  return result;
}

test("prefers complete sentences", () => {
  const text =
    "The lantern flickered. " +
    "The hallway was silent. " +
    "At dawn, they left.";

  const original = fixedSegments(
    text,
    36
  );

  const improved =
    improveLiterarySegments(original);

  assert.deepEqual(improved, [
    "The lantern flickered. ",
    "The hallway was silent. ",
    "At dawn, they left.",
  ]);
});

test("keeps dialogue sentences together", () => {
  const text =
    "“You are late,” she said. " +
    "“I know,” he replied. " +
    "The door closed.";

  const improved =
    improveLiterarySegments(
      fixedSegments(text, 35)
    );

  assert.deepEqual(improved, [
    "“You are late,” she said. ",
    "“I know,” he replied. ",
    "The door closed.",
  ]);
});

test("recognises common abbreviations", () => {
  const text =
    "Dr. Harper walked home. " +
    "She arrived at dusk. " +
    "It was raining.";

  const improved =
    improveLiterarySegments(
      fixedSegments(text, 32)
    );

  assert.equal(
    improved[0],
    "Dr. Harper walked home. "
  );
});

test("preserves original whitespace exactly", () => {
  const text =
    "First line.\r\n" +
    "Second line.\r\n" +
    "Third line.";

  const improved =
    improveLiterarySegments(
      fixedSegments(text, 20)
    );

  assert.equal(
    improved.join(""),
    text
  );
});

test("preserves formatting-sensitive segments", () => {
  const original = [
    "[[OPEN_1]]",
    "A long passage of formatted text.",
    "[[CLOSE_1]]",
  ];

  assert.deepEqual(
    improveLiterarySegments(original),
    original
  );

  const rawHtml = [
    "<em>Hello",
    " world</em>",
  ];

  assert.deepEqual(
    improveLiterarySegments(rawHtml),
    rawHtml
  );
});

test("falls back for text without safe breaks", () => {
  const text = "A".repeat(101);

  const original = fixedSegments(
    text,
    50
  );

  assert.deepEqual(
    improveLiterarySegments(original),
    original
  );
});

test("respects the existing segment limits", () => {
  const text =
    "A quiet morning began. " +
    "The clouds gathered overhead. " +
    "Then the rain started. " +
    "Everyone went inside.";

  const original = fixedSegments(
    text,
    35
  );

  const improved =
    improveLiterarySegments(original);

  const maxLength = Math.max(
    ...original.map(
      (segment) => segment.length
    )
  );

  assert.ok(
    improved.every(
      (segment) =>
        segment.length <= maxLength
    )
  );

  assert.ok(
    improved.length <=
      original.length + 1
  );

  assert.equal(
    improved.join(""),
    text
  );
});

test("leaves short and empty input unchanged", () => {
  assert.deepEqual(
    improveLiterarySegments([
      "A short sentence.",
    ]),
    ["A short sentence."]
  );

  assert.deepEqual(
    improveLiterarySegments([]),
    []
  );
});
