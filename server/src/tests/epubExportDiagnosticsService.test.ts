import test from "node:test";
import assert from "node:assert/strict";

import JSZip from "jszip";

import type {
  TranslationOptions,
} from "../services/translationService.js";

import {
  createEpubExportDiagnosticsService,
  getEpubIntegrityErrorResponse,
} from "../services/epubExportDiagnosticsService.js";

import {
  assertEpubReferences,
  EpubReferenceValidationError,
} from "../services/epubReferenceValidationService.js";

const settings: TranslationOptions = {
  targetLanguage: "French",
  style: "literary",
  contextMode: "previous",
};

function createArchive(
  body: string
): JSZip {
  const zip = new JSZip();

  zip.file(
    "OEBPS/Text/chapter.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <title>Chapter</title>
      </head>
      <body>
        ${body}
      </body>
    </html>`
  );

  return zip;
}

test("returns a successful integrity report", async () => {
  const zip = createArchive(
    '<p id="beginning">Hello</p>' +
    '<a href="#beginning">Back</a>'
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
  });

  const service =
    createEpubExportDiagnosticsService(
      async () => buffer
    );

  const result = await service.inspect(
    15,
    settings
  );

  assert.equal(result.valid, true);
  assert.equal(result.report.totalIssues, 0);
  assert.equal(
    result.report.xhtmlFilesChecked,
    1
  );
  assert.equal(
    result.report.localReferencesChecked,
    1
  );
});

test("returns details of missing resources", async () => {
  const zip = createArchive(
    '<img src="../Images/missing.png" />'
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
  });

  const service =
    createEpubExportDiagnosticsService(
      async () => {
        await assertEpubReferences(
          buffer
        );

        return buffer;
      }
    );

  const result = await service.inspect(
    15,
    settings
  );

  assert.equal(result.valid, false);
  assert.equal(result.report.totalIssues, 1);

  assert.equal(
    result.report.issues[0].kind,
    "missing_resource"
  );

  assert.equal(
    result.report.issues[0].file,
    "OEBPS/Text/chapter.xhtml"
  );
});

test("returns details of broken section links", async () => {
  const zip = createArchive(
    '<a href="#missing-section">Continue</a>'
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
  });

  const service =
    createEpubExportDiagnosticsService(
      async () => buffer
    );

  const result = await service.inspect(
    15,
    settings
  );

  assert.equal(result.valid, false);

  assert.ok(
    result.report.issues.some(
      (issue) =>
        issue.kind === "missing_fragment"
    )
  );
});

test("preserves the structured error report", async () => {
  const zip = createArchive(
    '<img src="missing.png" />'
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
  });

  let capturedError: unknown;

  try {
    await assertEpubReferences(buffer);
  } catch (error) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof
      EpubReferenceValidationError
  );

  const payload =
    getEpubIntegrityErrorResponse(
      capturedError
    );

  assert.ok(payload);

  assert.equal(
    payload.code,
    "EPUB_REFERENCE_VALIDATION_FAILED"
  );

  assert.equal(payload.report.totalIssues, 1);
});

test("does not classify unrelated errors as reference errors", () => {
  const payload =
    getEpubIntegrityErrorResponse(
      new Error("Network failure")
    );

  assert.equal(payload, null);
});

test("propagates unexpected generation failures", async () => {
  const service =
    createEpubExportDiagnosticsService(
      async () => {
        throw new Error(
          "EPUB metadata validation failed"
        );
      }
    );

  await assert.rejects(
    service.inspect(15, settings),
    /metadata validation failed/
  );
});

test("retains more than fifty issue details", async () => {
  const brokenImages = Array.from(
    { length: 60 },
    (_, index) =>
      `<img src="missing-${index}.png" />`
  ).join("");

  const zip = createArchive(brokenImages);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
  });

  const service =
    createEpubExportDiagnosticsService(
      async () => buffer
    );

  const result = await service.inspect(
    15,
    settings
  );

  assert.equal(result.valid, false);
  assert.equal(result.report.totalIssues, 60);
  assert.equal(result.report.issues.length, 60);
});
