import JSZip from "jszip";
import * as cheerio from "cheerio";
import { SyntaxValidator } from "fast-xml-validator";
import path from "node:path";

export interface EpubValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  filesChecked: number;
  xhtmlFilesChecked: number;
}

function validateXml(
  xml: string,
  filename: string,
  errors: string[]
): void {
  try {
    SyntaxValidator.validate(xml);
  } catch (error) {
    errors.push(
      `Invalid XML in ${filename}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

function resolveEpubPath(
  baseFile: string,
  relativePath: string
): string {
  const decodedPath = decodeURIComponent(
    relativePath.split(/[?#]/)[0]
  );

  return path.posix.normalize(
    path.posix.join(
      path.posix.dirname(baseFile),
      decodedPath
    )
  );
}

export async function validateEpub(
  epubBuffer: Buffer
): Promise<EpubValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let filesChecked = 0;
  let xhtmlFilesChecked = 0;

  // Check that the file begins with a ZIP header.
  if (
    epubBuffer.length < 4 ||
    epubBuffer.subarray(0, 4).toString("hex") !==
      "504b0304"
  ) {
    return {
      valid: false,
      errors: ["Invalid ZIP file signature"],
      warnings,
      filesChecked,
      xhtmlFilesChecked,
    };
  }

  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(epubBuffer, {
      checkCRC32: true,
    });
  } catch {
    return {
      valid: false,
      errors: ["EPUB ZIP archive could not be opened"],
      warnings,
      filesChecked,
      xhtmlFilesChecked,
    };
  }

  const mimetype = zip.file("mimetype");

  if (!mimetype) {
    errors.push("Missing mimetype file");
  } else {
    const value = await mimetype.async("string");

    if (value !== "application/epub+zip") {
      errors.push("Incorrect EPUB mimetype");
    }
  }

  const containerFile = zip.file(
    "META-INF/container.xml"
  );

  if (!containerFile) {
    errors.push("Missing META-INF/container.xml");
  } else {
    const containerXml =
      await containerFile.async("string");

    validateXml(
      containerXml,
      "META-INF/container.xml",
      errors
    );

    const $ = cheerio.load(containerXml, {
      xmlMode: true,
    });

    const rootfiles = $("rootfile").toArray();

    if (rootfiles.length === 0) {
      errors.push(
        "Container does not reference an OPF package"
      );
    }

    for (const rootfile of rootfiles) {
      const opfPath = $(rootfile).attr("full-path");

      if (!opfPath) {
        errors.push(
          "Container rootfile is missing full-path"
        );
        continue;
      }

      const opfFile = zip.file(opfPath);

      if (!opfFile) {
        errors.push(
          `Missing OPF package: ${opfPath}`
        );
        continue;
      }

      const opfXml = await opfFile.async("string");

      validateXml(opfXml, opfPath, errors);

      const opf = cheerio.load(opfXml, {
        xmlMode: true,
      });

      const manifest = opf("manifest > item");

      if (manifest.length === 0) {
        errors.push(
          `OPF manifest is empty: ${opfPath}`
        );
      }

      manifest.each((_index, element) => {
        const href = opf(element).attr("href");

        if (!href) {
          errors.push(
            `Manifest item missing href in ${opfPath}`
          );
          return;
        }

        // External resources are not ZIP entries.
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
          warnings.push(
            `External resource referenced: ${href}`
          );
          return;
        }

        try {
          const resourcePath = resolveEpubPath(
            opfPath,
            href
          );

          if (!zip.file(resourcePath)) {
            errors.push(
              `Missing EPUB resource: ${resourcePath}`
            );
          }
        } catch {
          errors.push(
            `Invalid manifest resource path: ${href}`
          );
        }
      });
    }
  }

  for (const [filename, file] of Object.entries(
    zip.files
  )) {
    if (file.dir) {
      continue;
    }

    filesChecked++;

    if (
      !filename.toLowerCase().endsWith(".xhtml") &&
      !filename.toLowerCase().endsWith(".html") &&
      !filename.toLowerCase().endsWith(".htm")
    ) {
      continue;
    }

    xhtmlFilesChecked++;

    const contents = await file.async("string");

    validateXml(contents, filename, errors);
  }

  if (xhtmlFilesChecked === 0) {
    errors.push("No XHTML or HTML files found");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    filesChecked,
    xhtmlFilesChecked,
  };
}
