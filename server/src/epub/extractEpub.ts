import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import path from "node:path";
import type { Element, AnyNode } from "domhandler";

export interface ContentBlock {
  id: string;
  type: "heading" | "paragraph";
  tagName: string;
  text: string;
  html: string;
  sourcePath: string;
  elementPath: string;
}

export interface Chapter {
  id: string;
  title: string;
  sourcePath: string;
  originalXhtml: string;
  blocks: ContentBlock[];
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

function resolveEpubPath(baseFile: string, relativePath: string): string {
  const decoded = decodeURIComponent(relativePath.split("#")[0]);

  return path.posix.normalize(
    path.posix.join(path.posix.dirname(baseFile), decoded),
  );
}

function getElementPath(
  $: cheerio.CheerioAPI,
  element: Element
): string {
  const parts: string[] = [];

  let current: Element | null = element;

  while (current !== null) {
    const tagName: string = current.tagName.toLowerCase();

    const parent: AnyNode | null = current.parent;

    if (!parent) {
      parts.unshift(`${tagName}[1]`);
      break;
    }

    const siblings = $(parent)
      .children(tagName)
      .toArray();

    const index = siblings.findIndex(
      (sibling) => sibling === current
    ) + 1;

    parts.unshift(`${tagName}[${index}]`);

    current = parent.type === "tag"
      ? (parent as Element)
      : null;
  }

  return parts.join("/");
}

function extractBlocks(
  xhtml: string,
  chapterId: string,
  sourcePath: string,
): ContentBlock[] {
  const $ = cheerio.load(xhtml, {
    xml: true,
  });

  const blocks: ContentBlock[] = [];

  $("body")
    .find("h1, h2, h3, h4, h5, h6, p")
    .each((_index, element) => {
      const tagName = element.tagName.toLowerCase();

      const type: ContentBlock["type"] = tagName.startsWith("h")
        ? "heading"
        : "paragraph";

      const text = $(element).text().replace(/\s+/g, " ").trim();

      if (!text) return;

      blocks.push({
        id: `${chapterId}-block-${blocks.length + 1}`,
        type,
        tagName,
        text,
        html: $(element).html() ?? "",
        sourcePath,
        elementPath: getElementPath($, element),
      });
    });

  return blocks;
}

export async function extractEpub(buffer: Buffer): Promise<ExtractedBook> {
  const zip = await JSZip.loadAsync(buffer);

  const containerFile = zip.file("META-INF/container.xml");

  if (!containerFile) {
    throw new Error("Invalid EPUB: container.xml not found");
  }

  const containerXml = await containerFile.async("string");

  const container = parser.parse(containerXml);

  const rootfile = asArray(container.container?.rootfiles?.rootfile)[0];

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

  const metadata = bookPackage.metadata ?? {};

  const title = getText(asArray(metadata.title)[0]) || "Unknown Title";

  const author = getText(asArray(metadata.creator)[0]) || "Unknown Author";

  const manifestItems = asArray(bookPackage.manifest?.item);

  const manifest = new Map<string, string>();

  for (const item of manifestItems) {
    const id = item?.["@_id"];
    const href = item?.["@_href"];

    if (typeof id === "string" && typeof href === "string") {
      manifest.set(id, href);
    }
  }

  const spineItems = asArray(bookPackage.spine?.itemref);

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

    const blocks = extractBlocks(xhtml, idref, chapterPath);

    const firstHeading = blocks.find((block) => block.type === "heading");

    chapters.push({
      id: idref,
      title: firstHeading?.text || `Section ${chapters.length + 1}`,
      sourcePath: chapterPath,
      originalXhtml: xhtml,
      blocks,
    });
  }

  return {
    title,
    author,
    chapters,
  };
}
