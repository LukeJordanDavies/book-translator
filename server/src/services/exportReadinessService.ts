import { createHash } from "node:crypto";

import type {
  TranslationOptions,
} from "./translationService.js";

import {
  qualityReviewService,
  type ReviewedQualityReport,
} from "./translationQualityReviewService.js";

import type {
  QualityIssueKind,
} from "./translationQualityService.js";

export type ExportReadinessStatus =
  | "blocked"
  | "ready_with_warnings"
  | "ready";

export interface ExportBlocker {
  code:
    | "no_blocks"
    | "missing_translations"
    | "missing_xhtml";
  message: string;
  count: number;
}

type ReadinessInput = Pick<
  ReviewedQualityReport,
  | "bookId"
  | "totalBlocks"
  | "translatedBlocks"
  | "missingBlocks"
  | "totalIssues"
  | "issueCounts"
  | "issues"
  | "reviewedVisibleIssues"
  | "unreviewedVisibleIssues"
>;

export interface ExportReadiness {
  bookId: number;
  status: ExportReadinessStatus;
  canProceed: boolean;

  totalBlocks: number;
  translatedBlocks: number;
  missingBlocks: number;

  totalQualityIssues: number;
  warningCount: number;

  reviewedVisibleIssues: number;
  unreviewedVisibleIssues: number;
  visibleIssueCount: number;
  hasMoreIssues: boolean;

  issueCounts: Record<QualityIssueKind, number>;
  blockers: ExportBlocker[];

  snapshotId: string;
}

export function buildExportReadiness(
  report: ReadinessInput
): ExportReadiness {
  const blockers: ExportBlocker[] = [];

  if (report.totalBlocks === 0) {
    blockers.push({
      code: "no_blocks",
      message:
        "No supported text blocks were found " +
        "in this book.",
      count: 1,
    });
  }

  if (report.missingBlocks > 0) {
    blockers.push({
      code: "missing_translations",
      message:
        `${report.missingBlocks} text block(s) ` +
        "still need translating.",
      count: report.missingBlocks,
    });
  }

  const missingXhtml =
    report.issueCounts.missing_translated_html;

  if (missingXhtml > 0) {
    blockers.push({
      code: "missing_xhtml",
      message:
        `${missingXhtml} translated block(s) ` +
        "have no saved XHTML.",
      count: missingXhtml,
    });
  }

  const warningCount =
    report.issueCounts.untranslated_source +
    report.issueCounts.short_translation +
    report.issueCounts.formatting_difference +
    report.issueCounts.glossary_inconsistency;

  const status: ExportReadinessStatus =
    blockers.length > 0
      ? "blocked"
      : warningCount > 0
        ? "ready_with_warnings"
        : "ready";

  // Stable fingerprint of the visible report.
  // Rechecking before unlocking lets React
  // detect changes since the summary was shown.
  const snapshotId = createHash("sha256")
    .update(
      JSON.stringify([
        report.bookId,
        report.totalBlocks,
        report.translatedBlocks,
        report.missingBlocks,
        report.issueCounts,
        report.issues.map((issue) => [
          issue.issueId,
          issue.reviewed,
        ]),
      ])
    )
    .digest("hex");

  return {
    bookId: report.bookId,
    status,
    canProceed: blockers.length === 0,

    totalBlocks: report.totalBlocks,
    translatedBlocks: report.translatedBlocks,
    missingBlocks: report.missingBlocks,

    totalQualityIssues: report.totalIssues,
    warningCount,

    reviewedVisibleIssues:
      report.reviewedVisibleIssues,

    unreviewedVisibleIssues:
      report.unreviewedVisibleIssues,

    visibleIssueCount:
      report.issues.length,

    hasMoreIssues:
      report.totalIssues >
      report.issues.length,

    issueCounts: report.issueCounts,
    blockers,
    snapshotId,
  };
}

export function getExportReadiness(
  bookId: number,
  settings: TranslationOptions
): ExportReadiness {
  const qualityReport =
    qualityReviewService.getReviewedReport(
      bookId,
      settings
    );

  return buildExportReadiness(qualityReport);
}
