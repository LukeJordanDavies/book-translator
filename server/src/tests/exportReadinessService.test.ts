import test from "node:test";
import assert from "node:assert/strict";

import type {
  ReviewedQualityReport,
} from "../services/translationQualityReviewService.js";

import type {
  QualityIssueKind,
} from "../services/translationQualityService.js";

import {
  buildExportReadiness,
} from "../services/exportReadinessService.js";

function emptyCounts(): Record<
  QualityIssueKind,
  number
> {
  return {
    missing_translation: 0,
    missing_translated_html: 0,
    untranslated_source: 0,
    short_translation: 0,
    formatting_difference: 0,
    glossary_inconsistency: 0,
  };
}

function makeReport(
  changes: Partial<ReviewedQualityReport> = {}
): ReviewedQualityReport {
  return {
    bookId: 15,
    generatedAt:
      "2026-11-26T00:00:00.000Z",

    totalBlocks: 10,
    translatedBlocks: 10,
    missingBlocks: 0,

    totalIssues: 0,
    displayLimit: 100,
    issueCounts: emptyCounts(),
    issues: [],

    reviewedVisibleIssues: 0,
    unreviewedVisibleIssues: 0,

    ...changes,
  };
}

test("allows export when checks are clean", () => {
  const result = buildExportReadiness(
    makeReport()
  );

  assert.equal(result.status, "ready");
  assert.equal(result.canProceed, true);
  assert.equal(result.warningCount, 0);
  assert.deepEqual(result.blockers, []);
});

test("blocks a book without text blocks", () => {
  const result = buildExportReadiness(
    makeReport({
      totalBlocks: 0,
      translatedBlocks: 0,
    })
  );

  assert.equal(result.status, "blocked");

  assert.ok(
    result.blockers.some(
      (blocker) =>
        blocker.code === "no_blocks"
    )
  );
});

test("blocks incomplete translations", () => {
  const result = buildExportReadiness(
    makeReport({
      translatedBlocks: 7,
      missingBlocks: 3,
      totalIssues: 3,
      issueCounts: {
        ...emptyCounts(),
        missing_translation: 3,
      },
    })
  );

  assert.equal(result.canProceed, false);

  assert.ok(
    result.blockers.some(
      (blocker) =>
        blocker.code === "missing_translations"
    )
  );
});

test("blocks missing translated XHTML", () => {
  const result = buildExportReadiness(
    makeReport({
      totalIssues: 1,
      issueCounts: {
        ...emptyCounts(),
        missing_translated_html: 1,
      },
    })
  );

  assert.equal(result.status, "blocked");

  assert.ok(
    result.blockers.some(
      (blocker) =>
        blocker.code === "missing_xhtml"
    )
  );
});

test("allows export with quality warnings", () => {
  const result = buildExportReadiness(
    makeReport({
      totalIssues: 2,
      issueCounts: {
        ...emptyCounts(),
        glossary_inconsistency: 2,
      },
    })
  );

  assert.equal(
    result.status,
    "ready_with_warnings"
  );

  assert.equal(result.canProceed, true);
  assert.equal(result.warningCount, 2);
});

test("reviewing a warning does not erase it", () => {
  const result = buildExportReadiness(
    makeReport({
      totalIssues: 1,
      reviewedVisibleIssues: 1,
      issueCounts: {
        ...emptyCounts(),
        untranslated_source: 1,
      },
    })
  );

  assert.equal(
    result.status,
    "ready_with_warnings"
  );

  assert.equal(
    result.reviewedVisibleIssues,
    1
  );

  assert.equal(result.warningCount, 1);
});

test("reports when not all issues are shown", () => {
  const result = buildExportReadiness(
    makeReport({
      totalIssues: 150,
      issueCounts: {
        ...emptyCounts(),
        glossary_inconsistency: 150,
      },
    })
  );

  assert.equal(result.hasMoreIssues, true);
  assert.equal(result.totalQualityIssues, 150);
});

test("changes the snapshot when content counts change", () => {
  const before = buildExportReadiness(
    makeReport()
  );

  const after = buildExportReadiness(
    makeReport({
      totalIssues: 1,
      issueCounts: {
        ...emptyCounts(),
        formatting_difference: 1,
      },
    })
  );

  assert.notEqual(
    before.snapshotId,
    after.snapshotId
  );
});
