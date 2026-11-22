import JSZip from "jszip";
import * as cheerio from "cheerio";
import { SyntaxValidator } from "fast-xml-validator";

import type {
  ExportBlock,
} from "../database/exportRepository.js";

import {
  LANGUAGE_CODES,
} from "./epubMetadataService.js";

export interface DocumentLanguageResult {
  languageCode: string;
  filesUpdated: number;
  filesChecked: number;
}

function validateXml(
  xml: string,
  filename: string
): void {
  try {
    SyntaxValidator.validate(xml);
  } catch (error) {
    throw new Error(
      `Invalid XHTML in ${filename}`,
      { cause: error }
    );
  }
}

export async function updateDocumentLanguages(
  zip: JSZip,
  blocks: ExportBlock[],
  targetLanguage: string
): Promise<DocumentLanguageResult> {
  const languageCode =
    LANGUAGE_CODES[targetLanguage];

  if (!languageCode) {
    throw new Error(
      `Unsupported target language: ${targetLanguage}`
    );
  }

  // Process each translated XHTML file once.
  const translatedFiles = new Set(
    blocks
      .filter(
        (block) =>
          Boolean(block.translatedHtml?.trim())
      )
      .map((block) => block.sourcePath)
  );

  let filesUpdated = 0;

  for (const filename of translatedFiles) {
    const file = zip.file(filename);

    if (!file) {
      throw new Error(
        `Missing translated XHTML file: ${filename}`
      );
    }

    const original = await file.async("string");

    validateXml(original, filename);

    const $ = cheerio.load(original, {
      xmlMode: true,
    });

    const html = $("html").first();

    if (!html.length) {
      throw new Error(
        `Missing html root element in ${filename}`
      );
    }

    const currentLang = html.attr("lang");
    const currentXmlLang =
      html.attr("xml:lang");

    // Skip files already using the target language.
    if (
      currentLang === languageCode &&
      currentXmlLang === languageCode
    ) {
      continue;
    }

    // Only update the root document language.
    // Preserve language attributes on nested elements.
    html.attr("lang", languageCode);
    html.attr("xml:lang", languageCode);

    const modified = $.xml();

    validateXml(modified, filename);

    zip.file(filename, modified);

    filesUpdated++;
  }

  return {
    languageCode,
    filesUpdated,
    filesChecked: translatedFiles.size,
  };
}
