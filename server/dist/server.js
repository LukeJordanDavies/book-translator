import express from "express";
import dotenv from "dotenv";
import "./database/database.js";
import bookRoutes from "./routes/books.js";
import translationRoutes from "./routes/translations.js";
import exportRoutes from "./routes/exports.js";
import bookTranslationRoutes from "./routes/bookTranslation.js";
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
app.use("/api/translations", translationRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/book-translation", bookTranslationRoutes);
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
