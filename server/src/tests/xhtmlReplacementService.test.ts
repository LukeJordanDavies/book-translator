import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";

import {
  replaceXhtmlParagraphs,
} from "../services/xhtmlReplacementService.js";

const originalXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Test Chapter</title>
  </head>
  <body>
    <div>
      <p>First paragraph.</p>
      <p>He said, <em>"Hello."</em></p>
    </div>
  </body>
</html>`;

test("replaces the correct paragraph", () => {
  const result = replaceXhtmlParagraphs(
    originalXhtml,
    [{
      blockId: 2,
      elementPath: "html[1]/body[1]/div[1]/p[2]",
      originalHtml: 'He said, <em>"Hello."</em>',
      translatedHtml: 'Il dit : <em>« Bonjour. »</em>',
    }]
  );

  const $ = cheerio.load(result, {
    xmlMode: true,
  });

  const paragraphs = $("p");

  assert.equal(
    paragraphs.eq(0).text(),
    "First paragraph."
  );

  assert.equal(
    paragraphs.eq(1).text(),
    "Il dit : « Bonjour. »"
  );

  assert.equal(
    paragraphs.eq(1).find("em").text(),
    "« Bonjour. »"
  );
});

test("rejects a missing element path", () => {
  assert.throws(() => {
    replaceXhtmlParagraphs(
      originalXhtml,
      [{
        blockId: 3,
        elementPath: "html[1]/body[1]/div[1]/p[99]",
        originalHtml: "Missing.",
        translatedHtml: "Manquant.",
      }]
    );
  }, /element not found/);
});

test("rejects mismatched original text", () => {
  assert.throws(() => {
    replaceXhtmlParagraphs(
      originalXhtml,
      [{
        blockId: 2,
        elementPath: "html[1]/body[1]/div[1]/p[2]",
        originalHtml: "Completely different text.",
        translatedHtml: "Bonjour.",
      }]
    );
  }, /does not match/);
});

test("rejects duplicate element paths", () => {
  const replacement = {
    blockId: 2,
    elementPath: "html[1]/body[1]/div[1]/p[2]",
    originalHtml: 'He said, <em>"Hello."</em>',
    translatedHtml: "Bonjour.",
  };

  assert.throws(() => {
    replaceXhtmlParagraphs(
      originalXhtml,
      [replacement, {
        ...replacement,
        blockId: 3,
      }]
    );
  }, /Duplicate element path/);
});

test("rejects invalid translated XHTML", () => {
  assert.throws(() => {
    replaceXhtmlParagraphs(
      originalXhtml,
      [{
        blockId: 2,
        elementPath: "html[1]/body[1]/div[1]/p[2]",
        originalHtml: 'He said, <em>"Hello."</em>',
        translatedHtml: "<em>Bonjour.",
      }]
    );
  }, /invalid translated XHTML/);
});
