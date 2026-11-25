import db from "../database/database.js";

import type {
  GlossaryEntry,
} from "../database/glossaryRepository.js";

import type {
  TranslationOptions,
} from "./translationService.js";

import {
  translateFormattedText,
} from "./translationService.js";

import {
  selectRelevantGlossaryEntries,
} from "./glossaryContextService.js";

import {
  acquireTranslationLock,
} from "./translationProcessingLock.js";

export const MAX_RETRANSLATION_BLOCKS = 5;
export const MAX_REVIEW_CANDIDATES = 100;

export class GlossaryRetranslationError
  extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "GlossaryRetranslationError";
  }
}

interface StoredBlock {
  blockId: number;
  chapterId: number;
  chapterTitle: string;
  chapterPosition: number;
  blockPosition: number;
  blockType: string;
  sourceText: string;
  originalHtml: string;
  translatedText: string;
}

export interface RetranslationCandidate {
  blockId: number;
  chapterId: number;
  chapterTitle: string;
  blockType: string;
  sourcePreview: string;
  translationPreview: string;
}

export interface CandidateResult {
  entry: GlossaryEntry;
  totalCandidates: number;
  candidates: RetranslationCandidate[];
}

export interface RetranslationResult {
  updatedIds: number[];
  failures: Array<{
    blockId: number;
    error: string;
  }>;
}

type TranslateBlock = typeof translateFormattedText;

function preview(text: string): string {
  const normalized = text
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 240
    ? normalized.slice(0, 240) + "…"
    : normalized;
}

export function createGlossaryRetranslationService(
  connection: typeof db,
  translateBlock: TranslateBlock =
    translateFormattedText
) {
  function getEntry(
    bookId: number,
    entryId: number,
    targetLanguage: string
  ): GlossaryEntry {
    const entry = connection.prepare(`
      SELECT
        id,
        book_id AS bookId,
        target_language AS targetLanguage,
        source_term AS sourceTerm,
        translated_term AS translatedTerm,
        category,
        notes,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM translation_glossary
      WHERE id = ?
        AND book_id = ?
        AND target_language = ?
    `).get(
      entryId,
      bookId,
      targetLanguage
    ) as GlossaryEntry | undefined;

    if (!entry) {
      throw new GlossaryRetranslationError(
        404,
        "Glossary entry not found"
      );
    }

    return entry;
  }

  function getMatchingBlocks(
    bookId: number,
    entry: GlossaryEntry,
    settings: TranslationOptions
  ): StoredBlock[] {
    const rows = connection.prepare(`
      SELECT
        cb.id AS blockId,
        c.id AS chapterId,
        c.title AS chapterTitle,
        c.position AS chapterPosition,
        cb.position AS blockPosition,
        cb.type AS blockType,
        cb.text AS sourceText,
        cb.html AS originalHtml,
        t.translated_text AS translatedText
      FROM content_blocks cb
      JOIN chapters c
        ON c.id = cb.chapter_id
      JOIN translations t
        ON t.block_id = cb.id
      WHERE c.book_id = ?
        AND cb.type IN ('heading', 'paragraph')
        AND t.target_language = ?
        AND t.style = ?
        AND t.context_mode = ?
      ORDER BY c.position, cb.position
    `).all(
      bookId,
      settings.targetLanguage,
      settings.style,
      settings.contextMode
    ) as StoredBlock[];

    // The original plain text is used for
    // matching, not the translated text.
    return rows.filter((row) =>
      selectRelevantGlossaryEntries(
        row.sourceText,
        [entry]
      ).length > 0
    );
  }

  function getCandidates(
    bookId: number,
    entryId: number,
    settings: TranslationOptions
  ): CandidateResult {
    const entry = getEntry(
      bookId,
      entryId,
      settings.targetLanguage
    );

    const matches = getMatchingBlocks(
      bookId,
      entry,
      settings
    );

    return {
      entry,
      totalCandidates: matches.length,
      candidates: matches
        .slice(0, MAX_REVIEW_CANDIDATES)
        .map((block) => ({
          blockId: block.blockId,
          chapterId: block.chapterId,
          chapterTitle: block.chapterTitle,
          blockType: block.blockType,
          sourcePreview: preview(
            block.sourceText
          ),
          translationPreview: preview(
            block.translatedText
          ),
        })),
    };
  }

  function getPreviousContext(
    block: StoredBlock,
    settings: TranslationOptions
  ): string | undefined {
    if (settings.contextMode !== "previous") {
      return undefined;
    }

    const row = connection.prepare(`
      SELECT
        t.translated_text AS translatedText
      FROM content_blocks cb
      JOIN translations t
        ON t.block_id = cb.id
      WHERE cb.chapter_id = ?
        AND cb.position < ?
        AND cb.type IN ('heading', 'paragraph')
        AND t.target_language = ?
        AND t.style = ?
        AND t.context_mode = ?
      ORDER BY cb.position DESC
      LIMIT 1
    `).get(
      block.chapterId,
      block.blockPosition,
      settings.targetLanguage,
      settings.style,
      settings.contextMode
    ) as
      | { translatedText: string }
      | undefined;

    return row?.translatedText || undefined;
  }

  async function retranslateSelected(
    bookId: number,
    entryId: number,
    settings: TranslationOptions,
    blockIds: number[]
  ): Promise<RetranslationResult> {
    if (
      !Array.isArray(blockIds) ||
      blockIds.length === 0 ||
      blockIds.length >
        MAX_RETRANSLATION_BLOCKS ||
      blockIds.some(
        (id) =>
          !Number.isSafeInteger(id) ||
          id < 1
      ) ||
      new Set(blockIds).size !== blockIds.length
    ) {
      throw new GlossaryRetranslationError(
        400,
        `Select between 1 and ` +
        `${MAX_RETRANSLATION_BLOCKS} unique blocks`
      );
    }

    const release = acquireTranslationLock(
      bookId,
      settings
    );

    if (!release) {
      throw new GlossaryRetranslationError(
        409,
        "This book is already being translated " +
        "using the selected settings. " +
        "Pause that operation and allow its " +
        "current batch to finish first."
      );
    }

    try {
      const entry = getEntry(
        bookId,
        entryId,
        settings.targetLanguage
      );

      const matchingBlocks = getMatchingBlocks(
        bookId,
        entry,
        settings
      );

      const blocksById = new Map(
        matchingBlocks.map(
          (block) => [block.blockId, block]
        )
      );

      // Validate the whole selection before
      // making any paid translation requests.
      const selectedBlocks = blockIds.map(
        (blockId) => {
          const block = blocksById.get(
            blockId
          );

          if (!block) {
            throw new GlossaryRetranslationError(
              400,
              `Block ${blockId} is not an ` +
              "eligible saved translation"
            );
          }

          return block;
        }
      );

      const result: RetranslationResult = {
        updatedIds: [],
        failures: [],
      };

      for (const block of selectedBlocks) {
        try {
          const previousContext =
            getPreviousContext(
              block,
              settings
            );

          // Deliberately bypass the
          // existing translation cache.
          const translated =
            await translateBlock(
              block.originalHtml,
              settings,
              previousContext,
              bookId
            );

          // Update only after the complete
          // translation succeeds.
          const update = connection.prepare(`
            UPDATE translations
            SET
              translated_text = ?,
              translated_html = ?
            WHERE block_id = ?
              AND target_language = ?
              AND style = ?
              AND context_mode = ?
          `).run(
            translated.translatedText,
            translated.translatedHtml,
            block.blockId,
            settings.targetLanguage,
            settings.style,
            settings.contextMode
          );

          if (update.changes === 0) {
            throw new Error(
              "Saved translation no longer exists"
            );
          }

          result.updatedIds.push(
            block.blockId
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown translation error";

          result.failures.push({
            blockId: block.blockId,
            error: message,
          });
        }
      }

      return result;
    } finally {
      // Always release the lock,
      // including when OpenAI fails.
      release();
    }
  }

  return {
    getCandidates,
    retranslateSelected,
  };
}

export const glossaryRetranslationService =
  createGlossaryRetranslationService(db);
