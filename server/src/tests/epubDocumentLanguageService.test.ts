import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import * as cheerio from "cheerio";

import {
  updateDocumentLanguages,
} from "../services/epubDocumentLanguageService.js";

import type {
  ExportBlock,
} from "../database/exportRepository.js";

const chapterPath = "OEBPS/chapter1.xhtml";

const block: ExportBlock = {
  id: 1,
  chapterId: 1,
  type: "paragraph",
  sourcePath: chapterPath,
  elementPath: "html[1]/body[1]/p[1]",
  originalHtml: "Hello world.",
  translatedHtml: "Bonjour le monde.",
};

function createArchive(
  rootLanguage = "en"
): JSZip {
  const zip = new JSZip();

  zip.file(
    chapterPath,
    `<html xmlns="http://www.w3.org/1999/xhtml"
      lang="${rootLanguage}"
      xml:lang="${rootLanguage}">
      <head>
        <title>Chapter One</title>
      </head>
      <body>
        <p>Bonjour le monde.</p>
        <p>
          <span lang="la" xml:lang="la">
            Carpe diem
          </span>
        </p>
      </body>
    </html>`
  );

  zip.file(
    "OEBPS/unrelated.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml"
      lang="en" xml:lang="en">
      <head><title>Other</title></head>
      <body><p>Unchanged text.</p></body>
    </html>`
  );

  return zip;
}

test("updates the root XHTML language", async () => {
  const zip = createArchive();

  const result = await updateDocumentLanguages(
    zip,
    [block],
    "French"
  );

  const xml = await zip
    .file(chapterPath)!
    .async("string");

  const $ = cheerio.load(xml, {
    xmlMode: true,
  });

  assert.equal($("html").attr("lang"), "fr");
  assert.equal($("html").attr("xml:lang"), "fr");

  assert.equal(result.languageCode, "fr");
  assert.equal(result.filesUpdated, 1);
});

test("preserves nested language annotations", async () => {
  const zip = createArchive();

  await updateDocumentLanguages(
    zip,
    [block],
    "French"
  );

  const xml = await zip
    .file(chapterPath)!
    .async("string");

  const $ = cheerio.load(xml, {
    xmlMode: true,
  });

  assert.equal($("span").attr("lang"), "la");
  assert.equal(
    $("span").attr("xml:lang"),
    "la"
  );
});

test("leaves unrelated XHTML files unchanged", async () => {
  const zip = createArchive();

  const before = await zip
    .file("OEBPS/unrelated.xhtml")!
    .async("string");

  await updateDocumentLanguages(
    zip,
    [block],
    "French"
  );

  const after = await zip
    .file("OEBPS/unrelated.xhtml")!
    .async("string");

  assert.equal(after, before);
});

test("skips files already using the target language", async () => {
  const zip = createArchive("fr");

  const result = await updateDocumentLanguages(
    zip,
    [block],
    "French"
  );

  assert.equal(result.filesUpdated, 0);
  assert.equal(result.filesChecked, 1);
});

test("rejects unsupported target languages", async () => {
  const zip = createArchive();

  await assert.rejects(
    () =>
      updateDocumentLanguages(
        zip,
        [block],
        "UnsupportedLanguage"
      ),
    /Unsupported target language/
  );
});
