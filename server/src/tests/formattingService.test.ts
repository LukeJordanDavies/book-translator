import test from "node:test";
import assert from "node:assert/strict";

import {
  prepareFormattedText,
  restoreFormattedHtml,
  validateFormattingMarkers,
} from "../services/formattingService.js";

test("preserves simple italic formatting", () => {
  const prepared = prepareFormattedText('He whispered, <em>"Hello."</em>');

  assert.equal(prepared.text, 'He whispered, [[OPEN_1]]"Hello."[[CLOSE_1]]');

  const restored = restoreFormattedHtml(
    "Il murmura : [[OPEN_1]]« Bonjour. »[[CLOSE_1]]",
    prepared.tags,
  );

  assert.equal(restored, "Il murmura : <em>« Bonjour. »</em>");
});

test("preserves nested formatting", () => {
  const prepared = prepareFormattedText(
    "<em>This is <strong>very</strong> important.</em>",
  );

  assert.equal(
    prepared.text,
    "[[OPEN_1]]This is [[OPEN_2]]very[[CLOSE_2]] important.[[CLOSE_1]]",
  );

  const restored = restoreFormattedHtml(
    "[[OPEN_1]]C'est [[OPEN_2]]très[[CLOSE_2]] important.[[CLOSE_1]]",
    prepared.tags,
  );

  assert.equal(
    restored,
    "<em>C&apos;est <strong>très</strong> important.</em>",
  );
});

test("rejects missing formatting markers", () => {
  const prepared = prepareFormattedText("<em>Hello</em>");

  assert.throws(() => {
    validateFormattingMarkers("Bonjour", prepared.tags);
  });
});

test("rejects duplicated markers", () => {
  const prepared = prepareFormattedText("<em>Hello</em>");

  assert.throws(() => {
    restoreFormattedHtml(
      "[[OPEN_1]]Bonjour[[CLOSE_1]][[OPEN_1]][[CLOSE_1]]",
      prepared.tags,
    );
  });
});

test("rejects incorrectly nested markers", () => {
  const prepared = prepareFormattedText("<em><strong>Hello</strong></em>");

  assert.throws(() => {
    restoreFormattedHtml(
      "[[OPEN_1]][[OPEN_2]]Bonjour[[CLOSE_1]][[CLOSE_2]]",
      prepared.tags,
    );
  });
});

test("escapes translated XML characters", () => {
  const restored = restoreFormattedHtml('Tom & Jerry said "hello" <again>', []);

  assert.equal(
    restored,
    "Tom &amp; Jerry said &quot;hello&quot; &lt;again&gt;",
  );
});

test("preserves safe link attributes", () => {
  const prepared = prepareFormattedText(
    '<a href="chapter2.xhtml">Next chapter</a>',
  );

  const restored = restoreFormattedHtml(
    "[[OPEN_1]]Chapitre suivant[[CLOSE_1]]",
    prepared.tags,
  );

  assert.equal(restored, '<a href="chapter2.xhtml">Chapitre suivant</a>');
});

test("rejects unsafe links", () => {
  assert.throws(() => {
    prepareFormattedText('<a href="javascript:alert(1)">Click</a>');
  });
});

test("rejects unsupported inline elements", () => {
  assert.throws(
    () =>
      prepareFormattedText(
        "Hello <video>Unsupported content</video> world"
      ),
    /Unsupported inline element: video/
  );
});

test("preserves line breaks", () => {
  const prepared = prepareFormattedText(
    "First line.<br/>Second line."
  );

  assert.equal(
    prepared.text,
    "First line.[[SELF_1]]Second line."
  );

  const result = restoreFormattedHtml(
    "Première ligne.[[SELF_1]]Deuxième ligne.",
    prepared.tags
  );

  assert.equal(
    result,
    "Première ligne.<br/>Deuxième ligne."
  );
});

test("preserves inline images", () => {
  const prepared = prepareFormattedText(
    'Look <img src="../images/castle.png" alt="Castle"/> here.'
  );

  const result = restoreFormattedHtml(
    "Regardez [[SELF_1]] ici.",
    prepared.tags
  );

  assert.equal(
    result,
    'Regardez <img src="../images/castle.png" alt="Castle"/> ici.'
  );
});

test("preserves standalone elements inside formatting", () => {
  const prepared = prepareFormattedText(
    "<em>First line.<br/>Second line.</em>"
  );

  const result = restoreFormattedHtml(
    "[[OPEN_1]]Première ligne.[[SELF_2]]Deuxième ligne.[[CLOSE_1]]",
    prepared.tags
  );

  assert.equal(
    result,
    "<em>Première ligne.<br/>Deuxième ligne.</em>"
  );
});

test("rejects missing standalone markers", () => {
  const prepared = prepareFormattedText(
    "Hello<br/>World"
  );

  assert.throws(
    () =>
      restoreFormattedHtml(
        "Bonjour le monde",
        prepared.tags
      ),
    /missing formatting marker/i
  );
});

test("rejects duplicated standalone markers", () => {
  const prepared = prepareFormattedText(
    "Hello<br/>World"
  );

  assert.throws(
    () =>
      restoreFormattedHtml(
        "Bonjour[[SELF_1]][[SELF_1]]monde",
        prepared.tags
      ),
    /duplicate formatting marker/i
  );
});

test("rejects unsafe inline image sources", () => {
  assert.throws(
    () =>
      prepareFormattedText(
        '<img src="javascript:alert(1)"/>'
      ),
    /unsafe image source/i
  );
});

