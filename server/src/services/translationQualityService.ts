import * as cheerio from "cheerio";

import db from "../database/database.js";

import {createGlossaryRepository,} from "../database/glossaryRepository.js";
import {selectRelevantGlossaryEntries,} from "./glossaryContextService.js";
import { createHash } from "node:crypto";
import type {TranslationOptions,} from "./translationService.js";
import {reviewTranslatedContent,} from "./translationContentReviewService.js";

export const MAX_REPORTED_ISSUES = 100;

export type QualityIssueKind =
  | "missing_translation"
  | "missing_translated_html"
  | "untranslated_source"
  | "short_translation"
  | "formatting_difference"
  | "glossary_inconsistency"
  | "possible_omission"
  | "possible_addition"
  | "repeated_translation"
  | "number_mismatch";

export interface QualityIssue {
  issueId: string;
  kind: QualityIssueKind;
  blockId: number;
  chapterTitle: string;
  message: string;
  sourcePreview: string;
  translationPreview: string;
}

export interface TranslationQualityReport {
  bookId: number;
  generatedAt: string;
  totalBlocks: number;
  translatedBlocks: number;
  missingBlocks: number;
  totalIssues: number;
  displayLimit: number;
  issueCounts: Record<QualityIssueKind, number>;
  issues: QualityIssue[];
}

export class QualityReportError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "QualityReportError";
  }
}

interface QualityBlock {
  blockId: number;
  chapterTitle: string;
  sourceText: string;
  sourceHtml: string;
  translationId: number | null;
  translatedText: string | null;
  translatedHtml: string | null;
}

interface MarkupSignature {
  tags: string[];
  links: string[];
  images: string[];
}

function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function makePreview(text: string): string {
  const value = text
    .replace(/\s+/gu, " ")
    .trim();

  return value.length > 180
    ? value.slice(0, 180) + "…"
    : value;
}

function getMarkupSignature(
  html: string
): MarkupSignature {
  // Parse as an XML-style fragment so that
  // EPUB XHTML tags remain case-sensitive.
  const $ = cheerio.load(
    `<qa-root>${html}</qa-root>`,
    {
      xmlMode: true,
    }
  );

  const tags: string[] = [];
  const links: string[] = [];
  const images: string[] = [];

  $("qa-root").find("*").each(
    (_index, element) => {
      const tag = element.tagName;

      tags.push(tag);

      if (tag === "a") {
        links.push(
          $(element).attr("href") ?? ""
        );
      }

      if (tag === "img") {
        images.push(
          $(element).attr("src") ?? ""
        );
      }
    }
  );

  return {
    tags: tags.sort(),
    links,
    images,
  };
}

function hasFormattingDifference(
  originalHtml: string,
  translatedHtml: string
): boolean {
  const original = getMarkupSignature(
    originalHtml
  );

  const translated = getMarkupSignature(
    translatedHtml
  );

  return (
    JSON.stringify(original) !==
    JSON.stringify(translated)
  );
}

function containsPreferredTerm(
  translatedText: string,
  preferredTranslation: string
): boolean {
  return normalizeText(translatedText).includes(
    normalizeText(preferredTranslation)
  );
}

export function getBookQualityReport(
  connection: typeof db,
  bookId: number,
  settings: TranslationOptions
): TranslationQualityReport {
  const book = connection.prepare(`
    SELECT id
    FROM books
    WHERE id = ?
  `).get(bookId);

  if (!book) {
    throw new QualityReportError(
      404,
      "Book not found"
    );
  }

  const blocks = connection.prepare(`
    SELECT
      cb.id AS blockId,
      c.title AS chapterTitle,
      cb.text AS sourceText,
      cb.html AS sourceHtml,
      t.id AS translationId,
      t.translated_text AS translatedText,
      t.translated_html AS translatedHtml
    FROM content_blocks cb
    JOIN chapters c
      ON c.id = cb.chapter_id
    LEFT JOIN translations t
      ON t.block_id = cb.id
      AND t.target_language = ?
      AND t.style = ?
      AND t.context_mode = ?
    WHERE c.book_id = ?
      AND cb.type IN ('heading', 'paragraph')
    ORDER BY c.position, cb.position
  `).all(
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
    bookId
  ) as QualityBlock[];

  const glossaryEntries =
    createGlossaryRepository(connection).list(
      bookId,
      settings.targetLanguage
    );

  const issueCounts: Record<
    QualityIssueKind,
    number
  > = {
    missing_translation: 0,
    missing_translated_html: 0,
    untranslated_source: 0,
    short_translation: 0,
    formatting_difference: 0,
    glossary_inconsistency: 0,
    possible_omission: 0,
    possible_addition: 0,
    repeated_translation: 0,
    number_mismatch: 0,
  };

  const issues: QualityIssue[] = [];

  let totalIssues = 0;
  let translatedBlocks = 0;
  let missingBlocks = 0;
  
  function addIssue(
    block: QualityBlock,
    kind: QualityIssueKind,
    message: string
  ) {
    totalIssues++;
    issueCounts[kind]++;

    if (issues.length >= MAX_REPORTED_ISSUES) {
      return;
    }

    // A review decision belongs to this
    // particular warning and exact content.
    //
    // When the text, XHTML, glossary wording,
    // or translation settings change, the
    // identifier changes too.
    const issueId = createHash("sha256")
      .update(
        JSON.stringify([
          bookId,
          block.blockId,
          settings.targetLanguage,
          settings.style,
          settings.contextMode,
          kind,
          message,
          block.sourceText,
          block.sourceHtml,
          block.translatedText,
          block.translatedHtml,
        ])
      )
      .digest("hex");

    issues.push({
      issueId,
      kind,
      blockId: block.blockId,
      chapterTitle: block.chapterTitle,
      message,
      sourcePreview: makePreview(
        block.sourceText
      ),
      translationPreview: makePreview(
        block.translatedText ?? ""
      ),
    });
  }

  const shortTranslationLanguages = new Set([
    "English",
    "French",
    "Spanish",
    "German",
    "Italian",
  ]);

  for (const block of blocks) {
    if (
      block.translationId === null ||
      !block.translatedText?.trim()
    ) {
      missingBlocks++;

      addIssue(
        block,
        "missing_translation",
        "This block has no saved translation."
      );

      continue;
    }

    translatedBlocks++;

    const source = normalizeText(
      block.sourceText
    );

    const translated = normalizeText(
      block.translatedText
    );

    if (!block.translatedHtml?.trim()) {
      addIssue(
        block,
        "missing_translated_html",
        "The saved translation has no XHTML " +
        "content for EPUB reconstruction."
      );
    } else if (
      hasFormattingDifference(
        block.sourceHtml,
        block.translatedHtml
      )
    ) {
      addIssue(
        block,
        "formatting_difference",
        "The XHTML tag structure or linked " +
        "resources differ from the original."
      );
    }

    // Exclude very short text and headings
    // that may legitimately stay unchanged.
    if (
      source.length >= 30 &&
      source === translated &&
      /\p{L}/u.test(source)
    ) {
      addIssue(
        block,
        "untranslated_source",
        "The translation appears identical " +
        "to the original text."
      );
    }

    // A conservative length warning.
    // Japanese is excluded because character
    // counts are not directly comparable.
    if (
      shortTranslationLanguages.has(
        settings.targetLanguage
      ) &&
      source.length >= 120 &&
      translated.length < source.length * 0.25
    ) {
      addIssue(
        block,
        "short_translation",
        "The translation is unusually short " +
        "compared with the original."
      );
    }

    // Review the original and translated text
    // for possible omissions, additions,
    // repeated sentences, and changed numbers.
    const contentFindings = reviewTranslatedContent(
      block.sourceText,
      block.translatedText,
      settings.targetLanguage
    );

    for (const finding of contentFindings) {
      addIssue(
        block,
        finding.kind,
        finding.message
      );
    }

    if (glossaryEntries.length > 0) {
      const relevant =
        selectRelevantGlossaryEntries(
          block.sourceText,
          glossaryEntries,
          glossaryEntries.length
        );

      for (const entry of relevant) {
        if (
          !containsPreferredTerm(
            block.translatedText,
            entry.translatedTerm
          )
        ) {
          addIssue(
            block,
            "glossary_inconsistency",
            `Preferred translation for ` +
            `"${entry.sourceTerm}" ` +
            `("${entry.translatedTerm}") ` +
            "was not found."
          );
        }
      }
    }
  }

  return {
    bookId,
    generatedAt: new Date().toISOString(),
    totalBlocks: blocks.length,
    translatedBlocks,
    missingBlocks,
    totalIssues,
    displayLimit: MAX_REPORTED_ISSUES,
    issueCounts,
    issues,
  };
}

export function getTranslationQualityReport(
  bookId: number,
  settings: TranslationOptions
): TranslationQualityReport {
  return getBookQualityReport(
    db,
    bookId,
    settings
  );
}
