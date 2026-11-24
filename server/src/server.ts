import express from "express";
import dotenv from "dotenv";
import "./database/database.js";
import bookRoutes from "./routes/books.js";
import translationRoutes from "./routes/translations.js";
import exportRoutes from "./routes/exports.js";
import bookTranslationRoutes from "./routes/bookTranslation.js";
import translationJobRoutes from "./routes/translationJobs.js";
import {translationJobRepository,} from "./database/translationJobRepository.js";
import {translationProcessingGuard,} from "./middleware/translationProcessingGuard.js";


dotenv.config();

const app = express();
const PORT = 3001;

app.use(express.json());

// Test endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Book Translator API is running"
  });
});

app.use("/api/books", bookRoutes);
app.use("/api/translations", translationProcessingGuard, translationRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/book-translation", bookTranslationRoutes);
app.use("/api/translation-jobs", translationJobRoutes);

// A process restart interrupts in-flight jobs.
// Their completed blocks remain saved in SQLite.
const recoveredJobs =
  translationJobRepository.recoverInterruptedJobs();

if (recoveredJobs > 0) {
  console.log(
    `Recovered ${recoveredJobs} interrupted ` +
    `translation job(s). They are now paused.`
  );
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
