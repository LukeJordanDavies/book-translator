import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { SyntaxValidator } from "fast-xml-validator";

export interface ParagraphReplacement {
  blockId: number;
  elementPath: string;
  originalHtml: string;
  translatedHtml: string;
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag" ||
    node.type === "script" ||
    node.type === "style";
}

function normaliseText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getFragmentText(html: string): string {
  const $ = cheerio.load(
    `<translation-root>${html}</translation-root>`,
    { xmlMode: true }
  );

  return normaliseText(
    $("translation-root").text()
  );
}

function findElementByPath(
  $: ReturnType<typeof cheerio.load>,
  elementPath: string
): Element | null {
  const segments = elementPath.split("/");

  let children: AnyNode[] = $.root()
    .contents()
    .toArray();

  let current: Element | null = null;

  for (const segment of segments) {
    const match = /^([A-Za-z_][\w:.-]*)\[(\d+)\]$/.exec(
      segment
    );

    if (!match) {
      throw new Error(
        `Invalid element path: ${elementPath}`
      );
    }

    const tagName = match[1];
    const position = Number(match[2]);

    const matchingElements = children
      .filter(isElement)
      .filter((element) => element.name === tagName);

    current = matchingElements[position - 1] ?? null;

    if (!current) {
      return null;
    }

    children = current.children;
  }

  return current;
}

export function replaceXhtmlParagraphs(
  originalXhtml: string,
  replacements: ParagraphReplacement[]
): string {
  const originalValidation =
    SyntaxValidator.validate(originalXhtml);

  if (originalValidation !== true) {
    throw new Error("Original XHTML is invalid");
  }

  const $ = cheerio.load(originalXhtml, {
    xmlMode: true,
  });

  const usedPaths = new Set<string>();

  for (const replacement of replacements) {
    if (usedPaths.has(replacement.elementPath)) {
      throw new Error(
        `Duplicate element path: ${replacement.elementPath}`
      );
    }

    usedPaths.add(replacement.elementPath);

    const element = findElementByPath(
      $,
      replacement.elementPath
    );

    if (!element) {
      throw new Error(
        `Block ${replacement.blockId}: element not found at ${replacement.elementPath}`
      );
    }

    const allowedBlockTags = new Set([
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ]);

    const actualTag = element.name.toLowerCase();

    if (!allowedBlockTags.has(actualTag)) {
      throw new Error(
        `Block ${replacement.blockId}: unsupported text element ${element.name}`
      );
    }

    const originalText = getFragmentText(
      replacement.originalHtml
    );

    const actualText = normaliseText(
      $(element).text()
    );

    if (originalText !== actualText) {
      throw new Error(
        `Block ${replacement.blockId}: original paragraph does not match`
      );
    }
    
    try {
    SyntaxValidator.validate(
        `<translation-root>${replacement.translatedHtml}</translation-root>`
    );
    } catch (error) {
    throw new Error(
        `Block ${replacement.blockId}: invalid translated XHTML`,
        { cause: error }
    );
    }

    $(element).html(replacement.translatedHtml);
  }

  const result = $.xml();

  const resultValidation =
    SyntaxValidator.validate(result);

  if (resultValidation !== true) {
    throw new Error(
      "Reconstructed XHTML failed validation"
    );
  }

  return result;
}
