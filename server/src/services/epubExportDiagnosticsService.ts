import type {
  TranslationOptions,
} from "./translationService.js";

import {
  generateTranslatedEpub,
} from "./epubExportService.js";

import {
  assertEpubReferences,
  EpubReferenceValidationError,
  type EpubReferenceReport,
} from "./epubReferenceValidationService.js";

export interface EpubIntegrityResult {
  valid: boolean;
  report: EpubReferenceReport;
}

export interface EpubIntegrityErrorResponse {
  code: "EPUB_REFERENCE_VALIDATION_FAILED";
  error: string;
  report: EpubReferenceReport;
}

type GenerateEpub = (
  bookId: number,
  settings: TranslationOptions
) => Promise<Buffer>;

export function createEpubExportDiagnosticsService(
  generateEpub: GenerateEpub =
    generateTranslatedEpub
) {
  async function inspect(
    bookId: number,
    settings: TranslationOptions
  ): Promise<EpubIntegrityResult> {
    try {
      // Reconstruct the EPUB from the
      // translations already saved in SQLite.
      const epubBuffer = await generateEpub(
        bookId,
        settings
      );

      // The generator already performs this
      // check. Retrieve the successful report
      // so React can show its statistics.
      const report = await assertEpubReferences(
        epubBuffer
      );

      return {
        valid: true,
        report,
      };
    } catch (error) {
      // Missing resources and broken links
      // become detailed reports, not generic
      // server failures.
      if (
        error instanceof
          EpubReferenceValidationError
      ) {
        return {
          valid: false,
          report: error.report,
        };
      }

      // Other failures still propagate:
      // missing translations, invalid EPUB
      // metadata, malformed archive, etc.
      throw error;
    }
  }

  return { inspect };
}

export function getEpubIntegrityErrorResponse(
  error: unknown
): EpubIntegrityErrorResponse | null {
  if (
    !(
      error instanceof
        EpubReferenceValidationError
    )
  ) {
    return null;
  }

  return {
    code: "EPUB_REFERENCE_VALIDATION_FAILED",
    error:
      `The generated EPUB contains ` +
      `${error.report.totalIssues} ` +
      `reference or structure issue(s).`,
    report: error.report,
  };
}

export const epubExportDiagnosticsService =
  createEpubExportDiagnosticsService();
