import test from "node:test";
import assert from "node:assert/strict";

import JSZip from "jszip";

import {
  inspectEpubReferences,
  assertEpubReferences,
} from "../services/epubReferenceValidationService.js";

function xhtml(
  body: string,
  headExtra = ""
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Test chapter</title>
    ${headExtra}
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function createTestEpub(): JSZip {
  const zip = new JSZip();

  zip.file(
    "OEBPS/Text/ch1.xhtml",
    xhtml(`
      <p>
        <a href="ch2.xhtml#scene-2">
          Continue reading
        </a>
      </p>
      <p>
        <img
          src="../Images/cover.png"
          alt="Book illustration"
        />
      </p>
    `)
  );

  zip.file(
    "OEBPS/Text/ch2.xhtml",
    xhtml(`
      <h1 id="scene-2">Chapter Two</h1>
      <p>The story continues.</p>
    `)
  );

  zip.file(
    "OEBPS/Images/cover.png",
    Buffer.from([137, 80, 78, 71])
  );

  return zip;
}

test("accepts valid internal links and images", async () => {
  const zip = createTestEpub();

  const report = await inspectEpubReferences(
    zip
  );

  assert.equal(report.xhtmlFilesChecked, 2);
  assert.equal(report.localReferencesChecked, 2);
  assert.equal(report.totalIssues, 0);
});

test("detects missing image files", async () => {
  const zip = createTestEpub();

  zip.remove("OEBPS/Images/cover.png");

  const report = await inspectEpubReferences(
    zip
  );

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.kind === "missing_resource" &&
        issue.reference ===
          "../Images/cover.png"
    )
  );
});

test("detects links to missing chapter files", async () => {
  const zip = createTestEpub();

  zip.remove("OEBPS/Text/ch2.xhtml");

  const report = await inspectEpubReferences(
    zip
  );

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.kind === "missing_resource" &&
        issue.reference ===
          "ch2.xhtml#scene-2"
    )
  );
});

test("detects missing section IDs", async () => {
  const zip = createTestEpub();

  zip.file(
    "OEBPS/Text/ch2.xhtml",
    xhtml(`
      <h1 id="different-id">Chapter Two</h1>
    `)
  );

  const report = await inspectEpubReferences(
    zip
  );

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.kind === "missing_fragment" &&
        issue.reference ===
          "ch2.xhtml#scene-2"
    )
  );
});

test("checks referenced CSS files", async () => {
  const zip = createTestEpub();

  zip.file(
    "OEBPS/Text/ch1.xhtml",
    xhtml(
      "<p>Chapter text.</p>",
      `<link
        rel="stylesheet"
        href="../Styles/missing.css"
      />`
    )
  );

  const report = await inspectEpubReferences(
    zip
  );

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.kind === "missing_resource" &&
        issue.reference ===
          "../Styles/missing.css"
    )
  );
});

test("supports encoded filenames and query strings", async () => {
  const zip = createTestEpub();

  zip.file(
    "OEBPS/Images/cover art.png",
    Buffer.from([137, 80, 78, 71])
  );

  zip.file(
    "OEBPS/Text/ch1.xhtml",
    xhtml(`
      <p>
        <a href="ch2.xhtml?edition=1#scene-2">
          Next chapter
        </a>
      </p>
      <img
        src="../Images/cover%20art.png"
        alt="Cover"
      />
    `)
  );

  const report = await inspectEpubReferences(
    zip
  );

  assert.equal(report.totalIssues, 0);
});

test("ignores external and email links", async () => {
  const zip = createTestEpub();

  zip.file(
    "OEBPS/Text/ch1.xhtml",
    xhtml(`
      <p>
        <a href="https://example.com">
          Website
        </a>
        <a href="mailto:reader@example.com">
          Email
        </a>
      </p>
    `)
  );

  const report = await inspectEpubReferences(
    zip
  );

  assert.equal(report.totalIssues, 0);
});

test("detects incomplete XHTML structure", async () => {
  const zip = createTestEpub();

  zip.file(
    "OEBPS/Text/ch1.xhtml",
    `<html>
      <body>
        <p>Missing head element</p>
      </body>
    </html>`
  );

  const report = await inspectEpubReferences(
    zip
  );

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.kind ===
          "invalid_xhtml_structure"
    )
  );
});

test("rejects unsafe link schemes", async () => {
  const zip = createTestEpub();

  zip.file(
    "OEBPS/Text/ch1.xhtml",
    xhtml(`
      <a href="javascript:alert(1)">
        Unsafe link
      </a>
    `)
  );

  const report = await inspectEpubReferences(
    zip
  );

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.kind === "unsafe_reference"
    )
  );
});

test("rejects archive paths that escape the ZIP root", async () => {
  const zip = createTestEpub();

  zip.file(
    "OEBPS/Text/ch1.xhtml",
    xhtml(`
      <img
        src="../../../../outside.png"
        alt="Missing"
      />
    `)
  );

  const report = await inspectEpubReferences(
    zip
  );

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.kind === "invalid_reference"
    )
  );
});

test("validates a generated ZIP buffer", async () => {
  const zip = createTestEpub();

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
  });

  const report = await assertEpubReferences(
    buffer
  );

  assert.equal(report.totalIssues, 0);

  zip.remove("OEBPS/Images/cover.png");

  const brokenBuffer = await zip.generateAsync({
    type: "nodebuffer",
  });

  await assert.rejects(
    assertEpubReferences(brokenBuffer),
    /EPUB reference validation failed/
  );
});
