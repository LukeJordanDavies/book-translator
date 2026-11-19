import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { SyntaxValidator } from "fast-xml-validator";

export interface FormattingTag {
  id: number;
  tagName: string;
  attributes: Record<string, string>;
}

export interface PreparedText {
  text: string;
  tags: FormattingTag[];
}

const ALLOWED_TAGS = new Set([
  "em",
  "i",
  "strong",
  "b",
  "span",
  "a",
  "small",
  "sup",
  "sub",
  "u",
  "code",
  "cite",
  "abbr",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "class",
  "lang",
  "xml:lang",
  "dir",
  "href",
  "title",
  "id",
]);

const MARKER_PATTERN = /\[\[(OPEN|CLOSE)_(\d+)\]\]/g;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag" ||
    node.type === "script" ||
    node.type === "style";
}

export function prepareFormattedText(
  html: string
): PreparedText {
  // Reject malformed XML before processing.
  const validation = SyntaxValidator.validate(
    `<translation-root>${html}</translation-root>`
  );

  if (validation !== true) {
    throw new Error("Original XHTML fragment is invalid");
  }

  const $ = cheerio.load(
    `<translation-root>${html}</translation-root>`,
    { xmlMode: true }
  );

  const root = $("translation-root").first();
  const tags: FormattingTag[] = [];

  function visit(node: AnyNode): string {
    if (node.type === "text") {
      return node.data;
    }

    if (!isElement(node)) {
      throw new Error(
        `Unsupported XHTML node: ${node.type}`
      );
    }

    const tagName = node.name.toLowerCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      throw new Error(
        `Unsupported inline element: ${tagName}`
      );
    }

    const id = tags.length + 1;
    const attributes: Record<string, string> = {};

    for (const [name, value] of Object.entries(
      node.attribs
    )) {
      if (!ALLOWED_ATTRIBUTES.has(name)) {
        throw new Error(
          `Unsupported attribute: ${name}`
        );
      }

      if (
        name === "href" &&
        /^(?:javascript|data|vbscript):/i.test(
          value.trim()
        )
      ) {
        throw new Error("Unsafe link destination");
      }

      attributes[name] = value;
    }

    tags.push({ id, tagName, attributes });

    const children = node.children
      .map((child) => visit(child))
      .join("");

    return (
      `[[OPEN_${id}]]` +
      children +
      `[[CLOSE_${id}]]`
    );
  }

  const text = root
    .contents()
    .toArray()
    .map((node) => visit(node))
    .join("");

  // Prevent original prose from masquerading
  // as generated formatting markers.
  const withoutMarkers = text.replace(
    MARKER_PATTERN,
    ""
  );

  if (withoutMarkers.includes("[[OPEN_") ||
      withoutMarkers.includes("[[CLOSE_")) {
    throw new Error(
      "Original text contains reserved marker syntax"
    );
  }

  return { text, tags };
}

export function validateFormattingMarkers(
  translatedText: string,
  tags: FormattingTag[]
): void {
  const stack: number[] = [];
  const opened = new Set<number>();
  const closed = new Set<number>();

  const knownIds = new Set(
    tags.map((tag) => tag.id)
  );

  const matches = translatedText.matchAll(
    MARKER_PATTERN
  );

  for (const match of matches) {
    const type = match[1];
    const id = Number(match[2]);

    if (!knownIds.has(id)) {
      throw new Error(
        `Unknown formatting marker: ${id}`
      );
    }

    if (type === "OPEN") {
      if (opened.has(id)) {
        throw new Error(
          `Duplicate opening marker: ${id}`
        );
      }

      opened.add(id);
      stack.push(id);
    } else {
      if (!opened.has(id)) {
        throw new Error(
          `Closing marker without opening: ${id}`
        );
      }

      if (closed.has(id)) {
        throw new Error(
          `Duplicate closing marker: ${id}`
        );
      }

      if (stack.at(-1) !== id) {
        throw new Error(
          `Incorrectly nested marker: ${id}`
        );
      }

      stack.pop();
      closed.add(id);
    }
  }

  for (const tag of tags) {
    if (!opened.has(tag.id) ||
        !closed.has(tag.id)) {
      throw new Error(
        `Missing formatting marker: ${tag.id}`
      );
    }
  }

  if (stack.length > 0) {
    throw new Error(
      "Unclosed formatting markers"
    );
  }

  // Detect marker-like text that was modified
  // and no longer matches the expected syntax.
  const remaining = translatedText.replace(
    MARKER_PATTERN,
    ""
  );

  if (
    remaining.includes("[[OPEN") ||
    remaining.includes("[[CLOSE")
  ) {
    throw new Error(
      "Malformed formatting marker detected"
    );
  }
}

export function restoreFormattedHtml(
  translatedText: string,
  tags: FormattingTag[]
): string {
  validateFormattingMarkers(
    translatedText,
    tags
  );

  const tagMap = new Map(
    tags.map((tag) => [tag.id, tag])
  );

  let html = "";
  let lastIndex = 0;

  for (const match of translatedText.matchAll(
    MARKER_PATTERN
  )) {
    const index = match.index;

    // Escape ordinary translated text.
    html += escapeXml(
      translatedText.slice(lastIndex, index)
    );

    const type = match[1];
    const id = Number(match[2]);
    const tag = tagMap.get(id);

    if (!tag) {
      throw new Error(
        `Unknown formatting marker: ${id}`
      );
    }

    if (type === "OPEN") {
      const attributes = Object.entries(
        tag.attributes
      )
        .map(
          ([name, value]) =>
            ` ${name}="${escapeXml(value)}"`
        )
        .join("");

      html += `<${tag.tagName}${attributes}>`;
    } else {
      html += `</${tag.tagName}>`;
    }

    lastIndex = index + match[0].length;
  }

  html += escapeXml(
    translatedText.slice(lastIndex)
  );

  const validation = SyntaxValidator.validate(
    `<translation-root>${html}</translation-root>`
  );

  if (validation !== true) {
    throw new Error(
      "Restored XHTML is invalid"
    );
  }

  return html;
}

