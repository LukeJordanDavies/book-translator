import JSZip from "jszip";
import * as cheerio from "cheerio";
import path from "node:path";
import { SyntaxValidator } from "fast-xml-validator";

import type {
  ExportBlock,
} from "../database/exportRepository.js";

const LANGUAGE_CODES: Record<string, string> = {
  English: "en",
  French: "fr",
  Spanish: "es",
  German: "de",
  Italian: "it",
  Japanese: "ja",
};

export interface MetadataUpdateResult {
  languageCode: string;
  packageFilesUpdated: number;
  navigationFilesUpdated: number;
  navigationLabelsUpdated: number;
}

function validateXml(
  content: string,
  filename: string
): void {
  try {
    SyntaxValidator.validate(content);
  } catch (error) {
    throw new Error(
      `Invalid XML in ${filename}`,
      { cause: error }
    );
  }
}

function normaliseText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function fragmentText(html: string): string {
  const $ = cheerio.load(
    `<root>${html}</root>`,
    { xmlMode: true }
  );

  return normaliseText($("root").text());
}

function resolveResource(
  baseFile: string,
  href: string
): string | null {
  const resource = href.split(/[?#]/)[0];

  if (
    /^[a-z][a-z0-9+.-]*:/i.test(resource) ||
    resource.startsWith("/") ||
    resource.startsWith("//") ||
    !resource
  ) {
    return null;
  }

  let decoded: string;

  try {
    decoded = decodeURIComponent(resource);
  } catch {
    return null;
  }

  const resolved = path.posix.normalize(
    path.posix.join(
      path.posix.dirname(baseFile),
      decoded
    )
  );

  if (
    resolved === ".." ||
    resolved.startsWith("../")
  ) {
    return null;
  }

  return resolved;
}

function buildHeadingLookup(
  blocks: ExportBlock[]
): Map<string, string | null> {
  const lookup = new Map<string, string | null>();

  for (const block of blocks) {
    if (
      block.type !== "heading" ||
      !block.translatedHtml
    ) {
      continue;
    }

    const original = fragmentText(
      block.originalHtml
    );

    const translated = fragmentText(
      block.translatedHtml
    );

    if (!original || !translated) {
      continue;
    }

    const key =
      `${path.posix.normalize(block.sourcePath)}\0` +
      original;

    // If two headings have the same original text
    // in the same file, don't guess which is which.
    if (lookup.has(key)) {
      lookup.set(key, null);
    } else {
      lookup.set(key, translated);
    }
  }

  return lookup;
}

function getTranslatedHeading(
  lookup: Map<string, string | null>,
  navigationPath: string,
  href: string,
  originalLabel: string
): string | null {
  const targetFile = resolveResource(
    navigationPath,
    href
  );

  if (!targetFile) {
    return null;
  }

  const key =
    `${targetFile}\0` +
    normaliseText(originalLabel);

  return lookup.get(key) ?? null;
}

async function updateNavigationXhtml(
  zip: JSZip,
  filename: string,
  headings: Map<string, string | null>,
  languageCode: string
): Promise<number> {
  const file = zip.file(filename);

  if (!file) {
    throw new Error(
      `Navigation file not found: ${filename}`
    );
  }

  const original = await file.async("string");

  validateXml(original, filename);

  const $ = cheerio.load(original, {
    xmlMode: true,
  });

  let updated = 0;

  // Limit edits to the table-of-contents nav.
  const toc = $("nav").filter((_index, element) => {
    const types = (
      $(element).attr("epub:type") ?? ""
    ).split(/\s+/);

    return types.includes("toc");
  });

  toc.find("a[href]").each((_index, element) => {
    const anchor = $(element);

    const href = anchor.attr("href");

    if (!href) {
      return;
    }

    // Preserve complex links containing nested markup.
    const hasOnlyText = anchor
      .contents()
      .toArray()
      .every((node) => node.type === "text");

    if (!hasOnlyText) {
      return;
    }

    const oldLabel = normaliseText(
      anchor.text()
    );

    const translated = getTranslatedHeading(
      headings,
      filename,
      href,
      oldLabel
    );

    if (!translated || translated === oldLabel) {
      return;
    }

    anchor.text(translated);

    // Keep equivalent accessibility labels in sync.
    if (
      anchor.attr("aria-label") === oldLabel
    ) {
      anchor.attr("aria-label", translated);
    }

    if (anchor.attr("title") === oldLabel) {
      anchor.attr("title", translated);
    }

    updated++;
  });

  if (updated > 0) {
    const html = $("html").first();

    if (html.attr("lang") !== undefined) {
      html.attr("lang", languageCode);
    }

    if (
      html.attr("xml:lang") !== undefined
    ) {
      html.attr("xml:lang", languageCode);
    }

    const result = $.xml();

    validateXml(result, filename);
    zip.file(filename, result);
  }

  return updated;
}

async function updateNcx(
  zip: JSZip,
  filename: string,
  headings: Map<string, string | null>
): Promise<number> {
  const file = zip.file(filename);

  if (!file) {
    throw new Error(
      `NCX file not found: ${filename}`
    );
  }

  const original = await file.async("string");

  validateXml(original, filename);

  const $ = cheerio.load(original, {
    xmlMode: true,
  });

  let updated = 0;

  $("navMap navPoint").each((_index, element) => {
    const navPoint = $(element);

    const href = navPoint
      .children("content")
      .first()
      .attr("src");

    const label = navPoint
      .children("navLabel")
      .first()
      .children("text")
      .first();

    if (!href || !label.length) {
      return;
    }

    const oldLabel = normaliseText(
      label.text()
    );

    const translated = getTranslatedHeading(
      headings,
      filename,
      href,
      oldLabel
    );

    if (!translated || translated === oldLabel) {
      return;
    }

    label.text(translated);
    updated++;
  });

  if (updated > 0) {
    const result = $.xml();

    validateXml(result, filename);
    zip.file(filename, result);
  }

  return updated;
}

export async function updateEpubMetadata(
  zip: JSZip,
  blocks: ExportBlock[],
  targetLanguage: string
): Promise<MetadataUpdateResult> {
  const languageCode =
    LANGUAGE_CODES[targetLanguage];

  if (!languageCode) {
    throw new Error(
      `Unsupported target language: ${targetLanguage}`
    );
  }

  const container = zip.file(
    "META-INF/container.xml"
  );

  if (!container) {
    throw new Error(
      "Missing EPUB container.xml"
    );
  }

  const containerXml =
    await container.async("string");

  validateXml(
    containerXml,
    "META-INF/container.xml"
  );

  const containerDoc = cheerio.load(
    containerXml,
    { xmlMode: true }
  );

  const opfPaths = containerDoc(
    "rootfile[full-path]"
  )
    .toArray()
    .map((element) =>
      containerDoc(element).attr("full-path")
    )
    .filter((value): value is string =>
      Boolean(value)
    );

  if (opfPaths.length === 0) {
    throw new Error(
      "No OPF package found in container.xml"
    );
  }

  const headings = buildHeadingLookup(blocks);

  const navPaths = new Set<string>();
  const ncxPaths = new Set<string>();

  let packageFilesUpdated = 0;

  for (const opfPath of opfPaths) {
    const opfFile = zip.file(opfPath);

    if (!opfFile) {
      throw new Error(
        `Missing OPF package: ${opfPath}`
      );
    }

    const opfXml =
      await opfFile.async("string");

    validateXml(opfXml, opfPath);

    const $ = cheerio.load(opfXml, {
      xmlMode: true,
    });

    const metadata = $(
      "package > metadata"
    ).first();

    if (!metadata.length) {
      throw new Error(
        `Missing metadata in ${opfPath}`
      );
    }

    const language = metadata
      .children()
      .filter(
        (_index, element) =>
          element.name === "dc:language"
      )
      .first();

    if (!language.length) {
      throw new Error(
        `Missing dc:language in ${opfPath}`
      );
    }

    language.text(languageCode);

    const packageVersion =
      $("package").first().attr("version") ?? "";

    // EPUB 3 requires the last-modified metadata.
    if (packageVersion.startsWith("3")) {
      const modified = metadata
        .children("meta")
        .filter((_index, element) => {
          const meta = $(element);

          return (
            meta.attr("property") ===
              "dcterms:modified" &&
            meta.attr("refines") === undefined
          );
        })
        .first();

      const timestamp = new Date()
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");

      if (modified.length) {
        modified.text(timestamp);
      } else {
        metadata.append(
          `<meta property="dcterms:modified">` +
          `${timestamp}</meta>`
        );
      }
    }

    $("manifest > item").each(
      (_index, element) => {
        const item = $(element);

        const href = item.attr("href");

        if (!href) {
          return;
        }

        const resourcePath = resolveResource(
          opfPath,
          href
        );

        if (!resourcePath) {
          return;
        }

        const properties = (
          item.attr("properties") ?? ""
        ).split(/\s+/);

        if (properties.includes("nav")) {
          navPaths.add(resourcePath);
        }

        if (
          item.attr("media-type") ===
          "application/x-dtbncx+xml"
        ) {
          ncxPaths.add(resourcePath);
        }
      }
    );

    const result = $.xml();

    validateXml(result, opfPath);
    zip.file(opfPath, result);

    packageFilesUpdated++;
  }

  let navigationFilesUpdated = 0;
  let navigationLabelsUpdated = 0;

  for (const filename of navPaths) {
    const count = await updateNavigationXhtml(
      zip,
      filename,
      headings,
      languageCode
    );

    if (count > 0) {
      navigationFilesUpdated++;
      navigationLabelsUpdated += count;
    }
  }

  for (const filename of ncxPaths) {
    const count = await updateNcx(
      zip,
      filename,
      headings
    );

    if (count > 0) {
      navigationFilesUpdated++;
      navigationLabelsUpdated += count;
    }
  }

  return {
    languageCode,
    packageFilesUpdated,
    navigationFilesUpdated,
    navigationLabelsUpdated,
  };
}
