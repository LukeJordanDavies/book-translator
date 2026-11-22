import test from "node:test";
import assert from "node:assert/strict";

import {
  splitTextIntoSegments,
  joinTextSegments,
} from "../services/textSegmentationService.js";

test("keeps short text in one segment", () => {
  const text = "This is a short paragraph.";

  const segments = splitTextIntoSegments(text);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, text);
});

test("splits long text into multiple segments", () => {
  const text =
    "This is the first sentence. " +
    "This is the second sentence. " +
    "This is the third sentence.";

  const segments = splitTextIntoSegments(
    text,
    30
  );

  assert.ok(segments.length > 1);
});

test("preserves all original text when joined", () => {
  const text =
    "The man entered the room.  " +
    "He looked around.\n\n" +
    "Nobody was there.";

  const segments = splitTextIntoSegments(
    text,
    25
  );

  const reconstructed =
    joinTextSegments(segments);

  assert.equal(reconstructed, text);
});

test("does not split inside formatting markers", () => {
  const text =
    "He looked at the " +
    "[[OPEN_1]]very old wooden door[[CLOSE_1]] " +
    "and opened it.";

  const segments = splitTextIntoSegments(
    text,
    20
  );

  const formattedSegment = segments.find(
    (segment) =>
      segment.text.includes("[[OPEN_1]]")
  );

  assert.ok(formattedSegment);

  assert.ok(
    formattedSegment.text.includes(
      "[[CLOSE_1]]"
    )
  );

  assert.equal(
    joinTextSegments(segments),
    text
  );
});

test("preserves nested formatting markers", () => {
  const text =
    "Before the formatted section. " +
    "[[OPEN_1]]Some italic " +
    "[[OPEN_2]]and bold[[CLOSE_2]] " +
    "text[[CLOSE_1]]. " +
    "After the formatted section.";

  const segments = splitTextIntoSegments(
    text,
    20
  );

  const segment = segments.find(
    (item) =>
      item.text.includes("[[OPEN_1]]")
  );

  assert.ok(segment);

  assert.ok(
    segment.text.includes("[[CLOSE_1]]")
  );

  assert.ok(
    segment.text.includes("[[OPEN_2]]")
  );

  assert.ok(
    segment.text.includes("[[CLOSE_2]]")
  );

  assert.equal(
    joinTextSegments(segments),
    text
  );
});

test("returns no segments for empty text", () => {
  const segments = splitTextIntoSegments("");

  assert.deepEqual(segments, []);
});

test("rejects invalid segment lengths", () => {
  assert.throws(
    () => splitTextIntoSegments("Example", 0),
    /positive integer/
  );

  assert.throws(
    () => splitTextIntoSegments("Example", -100),
    /positive integer/
  );
});


test("preserves standalone formatting markers", () => {
  const text =
    "The first sentence. " +
    "[[SELF_1]] " +
    "The second sentence. " +
    "The third sentence.";

  const segments = splitTextIntoSegments(
    text,
    20
  );

  assert.equal(
    joinTextSegments(segments),
    text
  );

  const segmentsWithMarker = segments.filter(
    (segment) =>
      segment.text.includes("[[SELF_1]]")
  );

  assert.equal(
    segmentsWithMarker.length,
    1
  );
});

