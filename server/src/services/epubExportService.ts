import JSZip from "jszip";
import { SyntaxValidator } from "fast-xml-validator";
import {
  replaceXhtmlParagraphs,
  type ParagraphReplacement,
} from "./xhtmlReplacementService.js";

import {
  getOriginalEpub,
  getExportBlocks,
  type ExportBlock,
} from "../database/exportRepository.js";

import {validateEpub,} from "./epubValidationService.js";
import type {TranslationOptions,} from "./translationService.js";
import {updateEpubMetadata,} from "./epubMetadataService.js";
import {updateDocumentLanguages,} from "./epubDocumentLanguageService.js";

export interface ExportValidation {
  ready: boolean;
  total: number;
  translated: number;
  missing: number;
  missingBlockIds: number[];
}

export function validateBookForExport(
  bookId: number,
  settings: TranslationOptions
): ExportValidation {
  const epub = getOriginalEpub(bookId);

  if (!epub) {
    throw new Error("BOOK_NOT_FOUND");
  }

  const blocks = getExportBlocks(
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode
  );

  const missingBlockIds: number[] = [];

  for (const block of blocks) {
    if (!block.translatedHtml?.trim()) {
      missingBlockIds.push(block.id);
      continue;
    }

    const validation = SyntaxValidator.validate(
      `<root>${block.translatedHtml}</root>`
    );

    if (validation !== true) {
      throw new Error(
        `Invalid translated XHTML for block ${block.id}`
      );
    }
  }

  return {
    ready: blocks.length > 0 &&
      missingBlockIds.length === 0,
    total: blocks.length,
    translated: blocks.length - missingBlockIds.length,
    missing: missingBlockIds.length,
    missingBlockIds,
  };
}


export async function prepareEpubArchive(
  bookId: number,
  settings: TranslationOptions
): Promise<{
  zip: JSZip;
  blocks: ExportBlock[];
}> {
  const validation = validateBookForExport(
    bookId,
    settings
  );

  if (!validation.ready) {
    throw new Error(
      `EXPORT_INCOMPLETE: ${validation.missing} paragraphs missing`
    );
  }

  const epubBuffer = getOriginalEpub(bookId);

  if (!epubBuffer) {
    throw new Error("BOOK_NOT_FOUND");
  }

  const zip = await JSZip.loadAsync(epubBuffer, {
    checkCRC32: true,
  });

  const mimetype = zip.file("mimetype");

  if (!mimetype) {
    throw new Error(
      "Invalid EPUB: mimetype file missing"
    );
  }

  const mimetypeValue = (
    await mimetype.async("string")
  ).trim();

  if (mimetypeValue !== "application/epub+zip") {
    throw new Error(
      "Invalid EPUB mimetype"
    );
  }

  if (!zip.file("META-INF/container.xml")) {
    throw new Error(
      "Invalid EPUB: container.xml missing"
    );
  }

  const blocks = getExportBlocks(
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode
  );

  // Confirm that every referenced XHTML file
  // exists in the original EPUB archive.
  const missingPaths = new Set<string>();

  for (const block of blocks) {
    if (!zip.file(block.sourcePath)) {
      missingPaths.add(block.sourcePath);
    }
  }

  if (missingPaths.size > 0) {
    throw new Error(
      "EPUB source files could not be located: " +
      [...missingPaths].join(", ")
    );
  }

  return {
    zip,
    blocks,
  };
}


export async function reconstructEpubXhtml(
  bookId: number,
  settings: TranslationOptions
): Promise<{
  zip: JSZip;
  blocks: ExportBlock[];
  replacedParagraphs: number;
  modifiedFiles: number;
}> {
  const { zip, blocks } = await prepareEpubArchive(
    bookId,
    settings
  );

  const blocksByFile = new Map<
    string,
    ExportBlock[]
  >();

  for (const block of blocks) {
    const existing = blocksByFile.get(
      block.sourcePath
    ) ?? [];

    existing.push(block);

    blocksByFile.set(
      block.sourcePath,
      existing
    );
  }

  let replacedParagraphs = 0;
  let modifiedFiles = 0;

  for (const [sourcePath, fileBlocks] of blocksByFile) {
    const file = zip.file(sourcePath);

    if (!file) {
      throw new Error(
        `Missing EPUB file: ${sourcePath}`
      );
    }

    const originalXhtml = await file.async("string");

    const replacements: ParagraphReplacement[] =
      fileBlocks.map((block) => {
        if (!block.translatedHtml) {
          throw new Error(
            `Missing translation for block ${block.id}`
          );
        }

        return {
          blockId: block.id,
          elementPath: block.elementPath,
          originalHtml: block.originalHtml,
          translatedHtml: block.translatedHtml,
        };
      });

    const translatedXhtml = replaceXhtmlParagraphs(
      originalXhtml,
      replacements
    );

    // Modify the in-memory ZIP, not the original
    // EPUB stored in SQLite.
    zip.file(sourcePath, translatedXhtml);

    replacedParagraphs += replacements.length;
    modifiedFiles++;
  }

  return {
    zip,
    blocks,
    replacedParagraphs,
    modifiedFiles,
  };
}


export async function generateTranslatedEpub(
  bookId: number,
  settings: TranslationOptions
): Promise<Buffer> {
  const {
    zip,
    blocks,
    replacedParagraphs,
  } = await reconstructEpubXhtml(
    bookId,
    settings
  );

  if (replacedParagraphs === 0) {
    throw new Error(
      "No translated text blocks available for export"
    );
  }

  // Update language metadata and navigation labels
  // after reconstructing XHTML, but before
  // packaging the final EPUB ZIP.
  const metadataResult = await updateEpubMetadata(
    zip,
    blocks,
    settings.targetLanguage
  );

  const documentLanguageResult =
    await updateDocumentLanguages(
      zip,
      blocks,
      settings.targetLanguage
    );

  console.log(
    `XHTML language updated: ` +
    `${documentLanguageResult.filesUpdated} files`
  );

  console.log(
    `EPUB metadata updated: language ${metadataResult.languageCode}`
  );

  console.log(
    `Navigation labels translated: ${metadataResult.navigationLabelsUpdated}`
  );

  // The EPUB specification requires the mimetype
  // file to be the first ZIP entry, uncompressed.
  const outputZip = new JSZip();

  outputZip.file(
    "mimetype",
    "application/epub+zip",
    {
      compression: "STORE",
    }
  );

  // Copy the remaining files from the modified EPUB.
  for (const [path, file] of Object.entries(
    zip.files
  )) {
    if (path === "mimetype") {
      continue;
    }

    if (file.dir) {
      outputZip.folder(path);
      continue;
    }

    const contents = await file.async("uint8array");

    outputZip.file(path, contents, {
      compression: "DEFLATE",
      compressionOptions: {
        level: 6,
      },
    });
  }
  
  const result = await outputZip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6,
  },
  });

  const validation = await validateEpub(result);

  if (!validation.valid) {
    console.error(
      "EPUB validation errors:",
      validation.errors
    );

    throw new Error(
      "EPUB_VALIDATION_FAILED: " +
      validation.errors.join("; ")
    );
  }

  if (validation.warnings.length > 0) {
    console.warn(
      "EPUB validation warnings:",
      validation.warnings
    );
  }

  console.log(
    `EPUB validated: ${validation.filesChecked} files, ` +
    `${validation.xhtmlFilesChecked} XHTML files`
  );

  return result;
}


