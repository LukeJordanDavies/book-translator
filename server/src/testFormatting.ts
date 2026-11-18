import {
  prepareFormattedText,
  restoreFormattedHtml,
} from "./services/formattingService.js";

const originalHtml = `
He said, <em>"This is <strong>very</strong> important."</em>
`;

const prepared = prepareFormattedText(originalHtml);

console.log("Prepared text:");
console.log(prepared.text);

console.log("\nFormatting tags:");
console.log(prepared.tags);

const exampleTranslation = `
Il murmura : [[OPEN_1]]« Je dois partir ce soir. »[[CLOSE_1]]
`;

const restored = restoreFormattedHtml(
  exampleTranslation,
  prepared.tags
);

console.log("\nRestored HTML:");
console.log(restored);
