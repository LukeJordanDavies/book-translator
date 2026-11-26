import path from "node:path";

import JSZip from "jszip";
import * as cheerio from "cheerio";

export type EpubReferenceIssueKind =
  | "missing_resource"
  | "missing_fragment"
  | "invalid_reference"
  | "unsafe_reference"
  | "invalid_xhtml_structure";

export interface EpubReferenceIssue {
  kind: EpubReferenceIssueKind;
  file: string;
  reference: string;
  message: string;
}

export interface EpubReferenceReport {
  xhtmlFilesChecked: number;
  localReferencesChecked: number;
  totalIssues: number;
  issues: EpubReferenceIssue[];
}

const MAX_STORED_ISSUES = 50;

const XHTML_EXTENSION =
  /\.(?:xhtml|html|htm)$/i;

const URL_SCHEME =
  /^[a-z][a-z0-9+.-]*:/i;

const UNSAFE_SCHEME =
  /^(?:javascript|vbscript|file):/i;

function isXhtmlFile(filename: string): boolean {
  return XHTML_EXTENSION.test(filename);
}

interface ResolvedReference {
  filename: string;
  fragment: string;
}

function resolveReference(
  sourceFile: string,
  reference: string
): ResolvedReference {
  // Separate the fragment BEFORE decoding the
  // path, because encoded '#' may occur in
  // legitimate filenames.
  const hashIndex = reference.indexOf("#");

  const withoutFragment =
    hashIndex === -1
      ? reference
      : reference.slice(0, hashIndex);

  const encodedFragment =
    hashIndex === -1
      ? ""
      : reference.slice(hashIndex + 1);

  const encodedPath =
    withoutFragment.split("?")[0];

  const decodedPath =
    decodeURIComponent(encodedPath);

  const fragment =
    decodeURIComponent(encodedFragment);

  const filename =
    decodedPath === ""
      ? sourceFile
      : decodedPath.startsWith("/")
        ? path.posix.normalize(
            decodedPath.slice(1)
          )
        : path.posix.normalize(
            path.posix.join(
              path.posix.dirname(sourceFile),
              decodedPath
            )
          );

  if (
    filename === "" ||
    filename === ".." ||
    filename.startsWith("../") ||
    filename.startsWith("/")
  ) {
    throw new Error(
      "Reference resolves outside the EPUB archive"
    );
  }

  return {
    filename,
    fragment,
  };
}


export async function inspectEpubReferences(
  zip: JSZip
): Promise<EpubReferenceReport> {
  const issues: EpubReferenceIssue[] = [];

  let totalIssues = 0;
  let localReferencesChecked = 0;

  function addIssue(
    kind: EpubReferenceIssueKind,
    file: string,
    reference: string,
    message: string
  ) {
    totalIssues++;

    if (issues.length < MAX_STORED_ISSUES) {
      issues.push({
        kind,
        file,
        reference,
        message,
      });
    }
  }

  const archiveFiles = new Set(
    Object.entries(zip.files)
      .filter(([, entry]) => !entry.dir)
      .map(([filename]) => filename)
  );

  // Store parsed XHTML documents so links to
  // other chapters can be checked for IDs.
  const documents = new Map<
    string,
    {
      $: ReturnType<typeof cheerio.load>;
      ids: Set<string>;
    }
  >();

  // First pass: load XHTML documents and
  // collect every element ID.
  for (const filename of archiveFiles) {
    if (!isXhtmlFile(filename)) {
      continue;
    }

    const entry = zip.file(filename);

    if (!entry) {
      continue;
    }

    const xhtml = await entry.async("string");

    const $ = cheerio.load(xhtml, {
      xmlMode: true,
    });

    const htmlElement = $("html").first();

    if (
      htmlElement.length === 0 ||
      htmlElement.find("head").length === 0 ||
      htmlElement.find("body").length === 0
    ) {
      addIssue(
        "invalid_xhtml_structure",
        filename,
        "",
        "Expected html, head and body elements."
      );
    }

    const ids = new Set<string>();

    $.root().find("*").each(
      (_index, element) => {
        const id =
        $(element).attr("id") ??
        $(element).attr("xml:id");

        if (id) {
        ids.add(id);
        }

        // Older EPUB documents sometimes use
        // named anchors instead of element IDs.
        if (
        element.tagName.toLowerCase() === "a"
        ) {
        const name = $(element).attr("name");

        if (name) {
            ids.add(name);
        }
        }
      }
    );

    documents.set(filename, {
      $,
      ids,
    });
  }

  if (documents.size === 0) {
    addIssue(
      "invalid_xhtml_structure",
      "(archive)",
      "",
      "No XHTML documents were found."
    );
  }

  // Second pass: inspect links and resources
  // once every document's IDs are known.
  for (const [filename, document] of documents) {
    const $ = document.$;

    $.root().find("*").each(
      (_index, element) => {
        const tagName =
          element.tagName
            .split(":")
            .pop()
            ?.toLowerCase();

        let reference: string | undefined;

        if (tagName === "a" || tagName === "link") {
          reference = $(element).attr("href");
        } else if (tagName === "img") {
          reference = $(element).attr("src");
        } else if (
          tagName === "image" ||
          tagName === "use"
        ) {
          reference =
            $(element).attr("href") ??
            $(element).attr("xlink:href");
        }

        if (
          reference === undefined ||
          reference.trim() === ""
        ) {
          return;
        }

        const value = reference.trim();

        if (UNSAFE_SCHEME.test(value)) {
          addIssue(
            "unsafe_reference",
            filename,
            value,
            "Unsafe local reference scheme."
          );
          return;
        }

        // Skip external URLs, mailto links,
        // embedded data URIs and similar schemes.
        if (
          URL_SCHEME.test(value) ||
          value.startsWith("//")
        ) {
          return;
        }

        localReferencesChecked++;

        let resolved: ResolvedReference;

        try {
          resolved = resolveReference(
            filename,
            value
          );
        } catch (error) {
          addIssue(
            "invalid_reference",
            filename,
            value,
            error instanceof Error
              ? error.message
              : "Invalid local reference."
          );
          return;
        }

        if (!archiveFiles.has(resolved.filename)) {
          addIssue(
            "missing_resource",
            filename,
            value,
            `Referenced file is missing: ` +
            resolved.filename
          );
          return;
        }

        // Fragment identifiers in XHTML should
        // point to an existing element ID.
        //
        // EPUB CFI fragments use a separate
        // addressing scheme, so skip ID checks
        // for those.
        if (
          resolved.fragment &&
          isXhtmlFile(resolved.filename) &&
          !resolved.fragment.startsWith(
            "epubcfi("
          )
        ) {
          const target =
            documents.get(resolved.filename);

          if (
            target &&
            !target.ids.has(resolved.fragment)
          ) {
            addIssue(
              "missing_fragment",
              filename,
              value,
              `Element ID "${resolved.fragment}" ` +
              `was not found in ${resolved.filename}`
            );
          }
        }
      }
    );
  }

  return {
    xhtmlFilesChecked: documents.size,
    localReferencesChecked,
    totalIssues,
    issues,
  };
}

export async function assertEpubReferences(
  epubBuffer: Buffer
): Promise<EpubReferenceReport> {
  const zip = await JSZip.loadAsync(epubBuffer);

  const report = await inspectEpubReferences(
    zip
  );

  if (report.totalIssues > 0) {
    const details = report.issues
      .slice(0, 10)
      .map(
        (issue) =>
          `${issue.file}: ${issue.message}` +
          (
            issue.reference
              ? ` (${issue.reference})`
              : ""
          )
      )
      .join("\n");

    throw new Error(
      `EPUB reference validation failed: ` +
      `${report.totalIssues} issue(s).\n` +
      details
    );
  }

  return report;
}

