import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { SyntaxValidator } from "fast-xml-validator";

export interface FormattingTag {
  id: number;
  tagName: string;
  attributes: Record<string, string>;
  selfClosing?: boolean;
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
  "s",
  "mark",
  "q",
  "dfn",
  "bdi",
  "bdo",
]);

const SELF_CLOSING_TAGS = new Set([
  "br",
  "img",
  "wbr",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "class",
  "lang",
  "xml:lang",
  "dir",
  "href",
  "title",
  "id",
  "src",
  "alt",
  "width",
  "height",
  "epub:type",
  "role",
  "aria-label",
  "aria-hidden",
]);

const MARKER_PATTERN =
  /\[\[(OPEN|CLOSE|SELF)_(\d+)\]\]/g;

const RESERVED_MARKER_PATTERN =
  /\[\[(?:OPEN|CLOSE|SELF)/;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isElement(node: AnyNode): node is Element {
  return (
    node.type === "tag" ||
    node.type === "script" ||
    node.type === "style"
  );
}

function isSafeImageSource(src: string): boolean {
  const value = src.trim();

  if (!value) {
    return false;
  }

  // Reject control characters and backslashes.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) {
    return false;
  }

  // Reject absolute and protocol-relative paths.
  if (value.startsWith("/")) {
    return false;
  }

  // Only allow local, relative EPUB resources.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }

  return true;
}

export function prepareFormattedText(
  html: string
): PreparedText {
  // Reject malformed XML before processing.
  try {
    SyntaxValidator.validate(
      `<translation-root>${html}</translation-root>`
    );
  } catch (error) {
    throw new Error(
      "Original XHTML fragment is invalid",
      { cause: error }
    );
  }

  const $ = cheerio.load(
    `<translation-root>${html}</translation-root>`,
    { xmlMode: true }
  );

  const root = $("translation-root").first();
  const tags: FormattingTag[] = [];

  // Check original text before generating markers.
  if (RESERVED_MARKER_PATTERN.test(root.text())) {
    throw new Error(
      "Original text contains reserved marker syntax"
    );
  }

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

    if (
      !ALLOWED_TAGS.has(tagName) &&
      !SELF_CLOSING_TAGS.has(tagName)
    ) {
      throw new Error(
        `Unsupported inline element: ${tagName}`
      );
    }

    const id = tags.length + 1;

    const attributes: Record<string, string> = {};

    // Validate each original XHTML attribute.
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
        (
          /[\u0000-\u001f\u007f]/.test(value) ||
          /^(?:javascript|data|vbscript):/i.test(
            value.trim()
          )
        )
      ) {
        throw new Error("Unsafe link destination");
      }

      // Validate inline image sources.
      if (
        name === "src" &&
        !isSafeImageSource(value)
      ) {
        throw new Error("Unsafe image source");
      }

      attributes[name] = value;
    }

    const selfClosing =
      SELF_CLOSING_TAGS.has(tagName);

    if (selfClosing && node.children.length > 0) {
      throw new Error(
        `Unexpected child content in ${tagName}`
      );
    }

    tags.push({
      id,
      tagName,
      attributes,
      ...(selfClosing ? { selfClosing: true } : {}),
    });

    // Standalone elements need only one marker.
    if (selfClosing) {
      return `[[SELF_${id}]]`;
    }

    // Recursively process ordinary inline elements.
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

  return { text, tags };
}

export function validateFormattingMarkers(
  translatedText: string,
  tags: FormattingTag[]
): void {
  const stack: number[] = [];

  const opened = new Set<number>();
  const closed = new Set<number>();
  const standalone = new Set<number>();

  const tagMap = new Map(
    tags.map((tag) => [tag.id, tag])
  );

  const matches = translatedText.matchAll(
    MARKER_PATTERN
  );

  for (const match of matches) {
    const type = match[1];
    const id = Number(match[2]);

    const tag = tagMap.get(id);

    if (!tag) {
      throw new Error(
        `Unknown formatting marker: ${id}`
      );
    }

    // Validate standalone markers.
    if (type === "SELF") {
      if (!tag.selfClosing) {
        throw new Error(
          `Unexpected standalone marker: ${id}`
        );
      }

      if (standalone.has(id)) {
        throw new Error(
          `Duplicate formatting marker: SELF_${id}`
        );
      }

      standalone.add(id);
      continue;
    }

    // Standalone tags cannot use paired markers.
    if (tag.selfClosing) {
      throw new Error(
        `Unexpected paired marker: ${id}`
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

  // Ensure that every expected marker is present.
  for (const tag of tags) {
    if (tag.selfClosing) {
      if (!standalone.has(tag.id)) {
        throw new Error(
          `Missing formatting marker: SELF_${tag.id}`
        );
      }

      continue;
    }

    if (
      !opened.has(tag.id) ||
      !closed.has(tag.id)
    ) {
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

  // Detect incorrectly formed markers.
  const remaining = translatedText.replace(
    MARKER_PATTERN,
    ""
  );

  if (RESERVED_MARKER_PATTERN.test(remaining)) {
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
    const index = match.index!;

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

    if (type === "OPEN" || type === "SELF") {
      const attributes = Object.entries(
        tag.attributes
      )
        .map(
          ([name, value]) =>
            ` ${name}="${escapeXml(value)}"`
        )
        .join("");

      if (type === "SELF") {
        html +=
          `<${tag.tagName}${attributes}/>`;
      } else {
        html +=
          `<${tag.tagName}${attributes}>`;
      }
    } else {
      html += `</${tag.tagName}>`;
    }

    lastIndex = index + match[0].length;
  }

  html += escapeXml(
    translatedText.slice(lastIndex)
  );

  // Validate the reconstructed XHTML.
  try {
    SyntaxValidator.validate(
      `<translation-root>${html}</translation-root>`
    );
  } catch (error) {
    throw new Error(
      "Restored XHTML is invalid",
      { cause: error }
    );
  }

  return html;
}

