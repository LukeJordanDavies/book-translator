
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import path from "node:path";

export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface ExtractedBook {
  title: string;
  author: string;
  chapters: Chapter[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function getText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    return getText(node["#text"]);
  }

  return "";
}

function resolveEpubPath(
  baseFile: string,
  relativePath: string
): string {
  const decoded = decodeURIComponent(
    relativePath.split("#")[0]
  );

  return path.posix.normalize(
    path.posix.join(path.posix.dirname(baseFile), decoded)
  );
}

function extractPlainText(xhtml: string): string {
  return xhtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractEpub(
  buffer: Buffer
): Promise<ExtractedBook> {
  const zip = await JSZip.loadAsync(buffer);

  // Find the EPUB package document.
  const containerFile = zip.file(
    "META-INF/container.xml"
  );

  if (!containerFile) {
    throw new Error("Invalid EPUB: container.xml not found");
  }

  const containerXml = await containerFile.async("string");
  const container = parser.parse(containerXml);

  const rootfile = asArray(
    container.container?.rootfiles?.rootfile
  )[0];

  const opfPath = rootfile?.["@_full-path"];

  if (typeof opfPath !== "string") {
    throw new Error("Invalid EPUB: OPF path not found");
  }

  const opfFile = zip.file(opfPath);

  if (!opfFile) {
    throw new Error("Invalid EPUB: package file not found");
  }

  const opfXml = await opfFile.async("string");
  const opf = parser.parse(opfXml);
  const bookPackage = opf.package;

  if (!bookPackage) {
    throw new Error("Invalid EPUB: package metadata missing");
  }

  // Extract book metadata.
  const metadata = bookPackage.metadata ?? {};

  const title =
    getText(asArray(metadata.title)[0]) || "Unknown Title";

  const author =
    getText(asArray(metadata.creator)[0]) || "Unknown Author";

  // Create a lookup of resources from the manifest.
  const manifestItems = asArray(
    bookPackage.manifest?.item
  );

  const manifest = new Map<string, string>();

  for (const item of manifestItems) {
    const id = item?.["@_id"];
    const href = item?.["@_href"];

    if (typeof id === "string" && typeof href === "string") {
      manifest.set(id, href);
    }
  }

  // Follow the spine to preserve reading order.
  const spineItems = asArray(
    bookPackage.spine?.itemref
  );

  const chapters: Chapter[] = [];

  for (const spineItem of spineItems) {
    const idref = spineItem?.["@_idref"];

    if (typeof idref !== "string") continue;

    const href = manifest.get(idref);
    if (!href) continue;

    const chapterPath = resolveEpubPath(opfPath, href);
    const chapterFile = zip.file(chapterPath);

    if (!chapterFile) continue;

    const xhtml = await chapterFile.async("string");
    const parsedChapter = parser.parse(xhtml);

    const body = parsedChapter.html?.body;

    // Extract the first heading, if present.
    const headingMatch = xhtml.match(
      /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i
    );

    const chapterTitle = headingMatch
      ? extractPlainText(headingMatch[1])
      : `Section ${chapters.length + 1}`;

    chapters.push({
      id: idref,
      title: chapterTitle,
      content: extractPlainText(xhtml),
    });
  }

  return {
    title,
    author,
    chapters,
  };
}
