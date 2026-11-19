import {
  prepareEpubArchive,
  validateBookForExport,
} from "./services/epubExportService.js";

import {
  reconstructEpubXhtml,
} from "./services/epubExportService.js";

const bookId = Number(process.argv[2]);

if (!Number.isSafeInteger(bookId) || bookId <= 0) {
  console.error(
    "Usage: npx tsx src/testEpubExport.ts <bookId>"
  );
  process.exit(1);
}

const settings = {
  targetLanguage: "French",
  style: "literary" as const,
  contextMode: "previous" as const,
};

async function main() {
  const validation = validateBookForExport(
    bookId,
    settings
  );

  console.log("Export readiness:");
  console.log(validation);

  if (!validation.ready) {
    console.log(
      "Book is not fully translated yet."
    );
    return;
  }

  console.log("\nReconstructing translated XHTML...");

  const reconstruction = await reconstructEpubXhtml(
    bookId,
    settings
  );

  console.log("\nReconstruction completed.");

  console.log(
    "Paragraphs replaced:",
    reconstruction.replacedParagraphs
  );

  console.log(
    "XHTML files modified:",
    reconstruction.modifiedFiles
  );

  console.log(
    "Files in EPUB:",
    Object.keys(reconstruction.zip.files).length
  );

  const { zip, blocks } = await prepareEpubArchive(
    bookId,
    settings
  );

  console.log("\nEPUB archive loaded successfully.");

  console.log(
    "Files in archive:",
    Object.keys(zip.files).length
  );

  console.log(
    "Paragraphs ready for export:",
    blocks.length
  );

  console.log("\nExample paragraph paths:");

  for (const block of blocks.slice(0, 5)) {
    console.log({
      sourcePath: block.sourcePath,
      elementPath: block.elementPath,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
