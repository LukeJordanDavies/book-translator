import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import JSZip from "jszip";
import { literaryCases } from "../tests/fixtures/literaryCases.js";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function chapterXhtml(title: string, cases: typeof literaryCases): string {
  const sections = cases.map((item) => {
    const paragraphs = item.sourceXhtml
      ? [item.sourceXhtml]
      : item.source.split(/\n\s*\n/).map(escapeXml);

    return [
      `<section id="${item.id}">`,
      `<h2>${escapeXml(item.title)}</h2>`,
      ...paragraphs.map((text, i) =>
        `<p id="${item.id}-p${i + 1}">${text}</p>`
      ),
      `</section>`,
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="../Styles/book.css"/>
  </head>
  <body>
    <h1>${escapeXml(title)}</h1>
    ${sections}
  </body>
</html>`;
}

async function main() {
  const zip = new JSZip();

  // EPUB requires mimetype first and without ZIP compression.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"
         unique-identifier="pub-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:4d4cd857-1c0d-455a-a11e-4d179e11c002</dc:identifier>
    <dc:title>Literary Translation Quality Test</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>Test fixture</dc:creator>
    <meta property="dcterms:modified">2026-11-28T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="Styles/book.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
    <itemref idref="chapter2"/>
  </spine>
</package>`);

  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        <li><a href="Text/ch1.xhtml">Chapter 1: Voice and meaning</a></li>
        <li><a href="Text/ch2.xhtml">Chapter 2: Accuracy and context</a></li>
      </ol>
    </nav>
  </body>
</html>`);

  zip.file(
    "OEBPS/Text/ch1.xhtml",
    chapterXhtml("Chapter 1: Voice and meaning", literaryCases.slice(0, 5))
  );
  zip.file(
    "OEBPS/Text/ch2.xhtml",
    chapterXhtml("Chapter 2: Accuracy and context", literaryCases.slice(5))
  );
  zip.file("OEBPS/Styles/book.css", `body { font-family: serif; line-height: 1.5; }
section { margin: 1em 0 2em; }
h2 { margin-top: 1.5em; }
`);

  const epub = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const outputDirectory = path.resolve(process.cwd(), "test-output");
  const outputPath = path.join(outputDirectory, "literary-quality-fixture.epub");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, epub);
  console.log(`Created test EPUB: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
