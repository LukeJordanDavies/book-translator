import db from "../database/database.js";

import {
  getBookQualityReport,
  QualityReportError,
  type QualityIssue,
  type TranslationQualityReport,
} from "./translationQualityService.js";

import type {
  TranslationOptions,
} from "./translationService.js";

export interface ReviewedQualityIssue
  extends QualityIssue {
  reviewed: boolean;
}

export type ReviewedQualityReport =
  Omit<TranslationQualityReport, "issues"> & {
    issues: ReviewedQualityIssue[];
    reviewedVisibleIssues: number;
    unreviewedVisibleIssues: number;
  };

export function createQualityReviewService(
  connection: typeof db
) {
  function getReviewedReport(
    bookId: number,
    settings: TranslationOptions
  ): ReviewedQualityReport {
    const report = getBookQualityReport(
      connection,
      bookId,
      settings
    );

    const rows = connection.prepare(`
      SELECT issue_id AS issueId
      FROM translation_quality_reviews
      WHERE book_id = ?
        AND target_language = ?
        AND style = ?
        AND context_mode = ?
    `).all(
      bookId,
      settings.targetLanguage,
      settings.style,
      settings.contextMode
    ) as Array<{ issueId: string }>;

    const reviewedIds = new Set(
      rows.map((row) => row.issueId)
    );

    const issues = report.issues.map(
      (issue): ReviewedQualityIssue => ({
        ...issue,
        reviewed: reviewedIds.has(
          issue.issueId
        ),
      })
    );

    const reviewedVisibleIssues =
      issues.filter(
        (issue) => issue.reviewed
      ).length;

    return {
      ...report,
      issues,
      reviewedVisibleIssues,
      unreviewedVisibleIssues:
        issues.length - reviewedVisibleIssues,
    };
  }

  function setReviewed(
    bookId: number,
    settings: TranslationOptions,
    issueId: string,
    reviewed: boolean
  ): {
    issueId: string;
    reviewed: boolean;
  } {
    if (!/^[a-f0-9]{64}$/.test(issueId)) {
      throw new QualityReportError(
        400,
        "Invalid quality issue ID"
      );
    }

    // Recalculate the current warnings before
    // accepting a review decision.
    //
    // This prevents a stale browser tab from
    // reviewing an old version of a passage.
    const report = getBookQualityReport(
      connection,
      bookId,
      settings
    );

    const issue = report.issues.find(
      (item) => item.issueId === issueId
    );

    if (!issue) {
      throw new QualityReportError(
        409,
        "This warning has changed or is no " +
        "longer available. Run the quality " +
        "checks again."
      );
    }

    if (reviewed) {
      connection.prepare(`
        INSERT INTO translation_quality_reviews (
          issue_id,
          book_id,
          block_id,
          target_language,
          style,
          context_mode
        )
        VALUES (?, ?, ?, ?, ?, ?)

        ON CONFLICT(issue_id) DO NOTHING
      `).run(
        issue.issueId,
        bookId,
        issue.blockId,
        settings.targetLanguage,
        settings.style,
        settings.contextMode
      );
    } else {
      connection.prepare(`
        DELETE FROM translation_quality_reviews
        WHERE issue_id = ?
          AND book_id = ?
          AND target_language = ?
          AND style = ?
          AND context_mode = ?
      `).run(
        issueId,
        bookId,
        settings.targetLanguage,
        settings.style,
        settings.contextMode
      );
    }

    return {
      issueId,
      reviewed,
    };
  }

  return {
    getReviewedReport,
    setReviewed,
  };
}

export const qualityReviewService =
  createQualityReviewService(db);
