import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import * as cheerio from "cheerio";

import {
  updateEpubMetadata,
} from "../services/epubMetadataService.js";

import type {
  ExportBlock,
} from "../database/exportRepository.js";

const heading: ExportBlock = {
  id: 1,
  chapterId: 1,
  type: "heading",
  sourcePath: "OEBPS/chapter1.xhtml",
  elementPath: "html[1]/body[1]/h1[1]",
  originalHtml: "Chapter One",
  translatedHtml: "Chapitre Un",
};

function makeArchive(
  epubVersion: "2.0" | "3.0" = "3.0"
): JSZip {
  const zip = new JSZip();

  zip.file(
    "mimetype",
    "application/epub+zip",
    { compression: "STORE" }
  );

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
    <container
      xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile
          full-path="OEBPS/content.opf"
          media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`
  );

  const navigationItem =
    epubVersion === "3.0"
      ? `<item id="nav"
           href="nav.xhtml"
           properties="nav"
           media-type="application/xhtml+xml"/>`
      : `<item id="ncx"
           href="toc.ncx"
           media-type="application/x-dtbncx+xml"/>`;

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
    <package
      xmlns="http://www.idpf.org/2007/opf"
      version="${epubVersion}"
      unique-identifier="book-id">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="book-id">test-book</dc:identifier>
        <dc:title>Test Book</dc:title>
        <dc:language>en</dc:language>
      </metadata>
      <manifest>
        <item id="chapter"
          href="chapter1.xhtml"
          media-type="application/xhtml+xml"/>
        ${navigationItem}
      </manifest>
      <spine>
        <itemref idref="chapter"/>
      </spine>
    </package>`
  );

  zip.file(
    "OEBPS/chapter1.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>Chapter One</title></head>
      <body>
        <h1>Chapter One</h1>
      </body>
    </html>`
  );

  if (epubVersion === "3.0") {
    zip.file(
      "OEBPS/nav.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"
        xmlns:epub="http://www.idpf.org/2007/ops"
        lang="en">
        <head><title>Contents</title></head>
        <body>
          <nav epub:type="toc">
            <ol>
              <li>
                <a href="chapter1.xhtml">Chapter One</a>
              </li>
            </ol>
          </nav>
        </body>
      </html>`
    );
  } else {
    zip.file(
      "OEBPS/toc.ncx",
      `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"
        version="2005-1">
        <navMap>
          <navPoint id="chapter-1" playOrder="1">
            <navLabel>
              <text>Chapter One</text>
            </navLabel>
            <content src="chapter1.xhtml"/>
          </navPoint>
        </navMap>
      </ncx>`
    );
  }

  return zip;
}

test("updates EPUB 3 language metadata", async () => {
  const zip = makeArchive();

  const result = await updateEpubMetadata(
    zip,
    [heading],
    "French"
  );

  const xml = await zip
    .file("OEBPS/content.opf")!
    .async("string");

  const $ = cheerio.load(xml, {
    xmlMode: true,
  });

  assert.equal(
    $("dc\\:language").first().text(),
    "fr"
  );

  assert.match(
    xml,
    /dcterms:modified/
  );

  assert.equal(result.languageCode, "fr");
});

test("translates EPUB 3 navigation labels", async () => {
  const zip = makeArchive();

  const result = await updateEpubMetadata(
    zip,
    [heading],
    "French"
  );

  const xml = await zip
    .file("OEBPS/nav.xhtml")!
    .async("string");

  const $ = cheerio.load(xml, {
    xmlMode: true,
  });

  assert.equal(
    $("nav a").text(),
    "Chapitre Un"
  );

  assert.equal(
    $("nav a").attr("href"),
    "chapter1.xhtml"
  );

  assert.equal(
    $("html").attr("lang"),
    "fr"
  );

  assert.equal(
    result.navigationLabelsUpdated,
    1
  );
});

test("translates EPUB 2 NCX labels", async () => {
  const zip = makeArchive("2.0");

  const result = await updateEpubMetadata(
    zip,
    [heading],
    "French"
  );

  const xml = await zip
    .file("OEBPS/toc.ncx")!
    .async("string");

  const $ = cheerio.load(xml, {
    xmlMode: true,
  });

  assert.equal(
    $("navLabel > text").text(),
    "Chapitre Un"
  );

  assert.equal(
    $("content").attr("src"),
    "chapter1.xhtml"
  );

  assert.equal(
    result.navigationLabelsUpdated,
    1
  );
});

test("does not guess ambiguous heading translations", async () => {
  const zip = makeArchive();

  const duplicate: ExportBlock = {
    ...heading,
    id: 2,
    translatedHtml: "Premier Chapitre",
  };

  const result = await updateEpubMetadata(
    zip,
    [heading, duplicate],
    "French"
  );

  const xml = await zip
    .file("OEBPS/nav.xhtml")!
    .async("string");

  const $ = cheerio.load(xml, {
    xmlMode: true,
  });

  assert.equal(
    $("nav a").text(),
    "Chapter One"
  );

  assert.equal(
    result.navigationLabelsUpdated,
    0
  );
});

test("rejects unsupported target languages", async () => {
  const zip = makeArchive();

  await assert.rejects(
    () =>
      updateEpubMetadata(
        zip,
        [heading],
        "Klingon"
      ),
    /Unsupported target language/
  );
});


test("updates navigation language without matching headings", async () => {
  const zip = makeArchive();

  await updateEpubMetadata(
    zip,
    [],
    "French"
  );

  const xml = await zip
    .file("OEBPS/nav.xhtml")!
    .async("string");

  const $ = cheerio.load(xml, {
    xmlMode: true,
  });

  assert.equal(
    $("html").attr("lang"),
    "fr"
  );

  assert.equal(
    $("html").attr("xml:lang"),
    "fr"
  );

  // An unmatched label must not be translated.
  assert.equal(
    $("nav a").text(),
    "Chapter One"
  );
});

