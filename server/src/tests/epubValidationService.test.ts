import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import {
  validateEpub,
} from "../services/epubValidationService.js";

async function createTestEpub(
  options: {
    includeChapter?: boolean;
    chapterContent?: string;
  } = {}
): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "mimetype",
    "application/epub+zip",
    { compression: "STORE" }
  );

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
    <container version="1.0"
      xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile
          full-path="OEBPS/content.opf"
          media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`
  );

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf"
      version="3.0"
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
      </manifest>
      <spine>
        <itemref idref="chapter"/>
      </spine>
    </package>`
  );

  if (options.includeChapter !== false) {
    zip.file(
      "OEBPS/chapter1.xhtml",
      options.chapterContent ??
        `<?xml version="1.0"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <head><title>Chapter 1</title></head>
          <body><p>Hello world.</p></body>
        </html>`
    );
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

test("accepts a structurally valid EPUB", async () => {
  const epub = await createTestEpub();

  const result = await validateEpub(epub);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.xhtmlFilesChecked, 1);
});

test("rejects an invalid ZIP", async () => {
  const result = await validateEpub(
    Buffer.from("Not an EPUB")
  );

  assert.equal(result.valid, false);
});

test("detects a missing XHTML resource", async () => {
  const epub = await createTestEpub({
    includeChapter: false,
  });

  const result = await validateEpub(epub);

  assert.equal(result.valid, false);

  assert.ok(
    result.errors.some(
      (error) => error.includes(
        "Missing EPUB resource"
      )
    )
  );
});

test("detects invalid XHTML", async () => {
  const epub = await createTestEpub({
    chapterContent:
      "<html><body><p>Unclosed paragraph</body></html>",
  });

  const result = await validateEpub(epub);

  assert.equal(result.valid, false);

  assert.ok(
    result.errors.some(
      (error) => error.includes("Invalid XML")
    )
  );
});
