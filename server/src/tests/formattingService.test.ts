import test from "node:test";
import assert from "node:assert/strict";

import {
  prepareFormattedText,
  restoreFormattedHtml,
  validateFormattingMarkers,
} from "../services/formattingService.js";

test("preserves simple italic formatting", () => {
  const prepared = prepareFormattedText(
    'He whispered, <em>"Hello."</em>'
  );

  assert.equal(
    prepared.text,
    'He whispered, [[OPEN_1]]"Hello."[[CLOSE_1]]'
  );

  const restored = restoreFormattedHtml(
    'Il murmura : [[OPEN_1]]« Bonjour. »[[CLOSE_1]]',
    prepared.tags
  );

  assert.equal(
    restored,
    'Il murmura : <em>« Bonjour. »</em>'
  );
});

test("preserves nested formatting", () => {
  const prepared = prepareFormattedText(
    '<em>This is <strong>very</strong> important.</em>'
  );

  assert.equal(
    prepared.text,
    "[[OPEN_1]]This is [[OPEN_2]]very[[CLOSE_2]] important.[[CLOSE_1]]"
  );

  const restored = restoreFormattedHtml(
    "[[OPEN_1]]C'est [[OPEN_2]]très[[CLOSE_2]] important.[[CLOSE_1]]",
    prepared.tags
  );

  assert.equal(
    restored,
    "<em>C&apos;est <strong>très</strong> important.</em>"
  );
});

test("rejects missing formatting markers", () => {
  const prepared = prepareFormattedText(
    "<em>Hello</em>"
  );

  assert.throws(() => {
    validateFormattingMarkers(
      "Bonjour",
      prepared.tags
    );
  });
});

test("rejects duplicated markers", () => {
  const prepared = prepareFormattedText(
    "<em>Hello</em>"
  );

  assert.throws(() => {
    restoreFormattedHtml(
      "[[OPEN_1]]Bonjour[[CLOSE_1]][[OPEN_1]][[CLOSE_1]]",
      prepared.tags
    );
  });
});

test("rejects incorrectly nested markers", () => {
  const prepared = prepareFormattedText(
    "<em><strong>Hello</strong></em>"
  );

  assert.throws(() => {
    restoreFormattedHtml(
      "[[OPEN_1]][[OPEN_2]]Bonjour[[CLOSE_1]][[CLOSE_2]]",
      prepared.tags
    );
  });
});

test("escapes translated XML characters", () => {
  const restored = restoreFormattedHtml(
    'Tom & Jerry said "hello" <again>',
    []
  );

  assert.equal(
    restored,
    "Tom &amp; Jerry said &quot;hello&quot; &lt;again&gt;"
  );
});

test("preserves safe link attributes", () => {
  const prepared = prepareFormattedText(
    '<a href="chapter2.xhtml">Next chapter</a>'
  );

  const restored = restoreFormattedHtml(
    "[[OPEN_1]]Chapitre suivant[[CLOSE_1]]",
    prepared.tags
  );

  assert.equal(
    restored,
    '<a href="chapter2.xhtml">Chapitre suivant</a>'
  );
});

test("rejects unsafe links", () => {
  assert.throws(() => {
    prepareFormattedText(
      '<a href="javascript:alert(1)">Click</a>'
    );
  });
});

test("rejects unsupported inline elements", () => {
  assert.throws(() => {
    prepareFormattedText(
      "<img src='image.jpg' />"
    );
  });
});
