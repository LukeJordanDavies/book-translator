import { Router } from "express";
import multer from "multer";
import { extractEpub } from "../epub/extractEpub.js";
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 15 * 1024 * 1024,
    },
    fileFilter: (_req, file, callback) => {
        if (!file.originalname.toLowerCase().endsWith(".epub")) {
            callback(new Error("Only EPUB files are supported"));
            return;
        }
        callback(null, true);
    },
});
router.post("/upload", upload.single("book"), async (req, res) => {
    if (!req.file) {
        res.status(400).json({
            error: "No EPUB file uploaded",
        });
        return;
    }
    try {
        const book = await extractEpub(req.file.buffer);
        res.json({
            message: "EPUB extracted successfully",
            filename: req.file.originalname,
            book,
        });
    }
    catch (error) {
        console.error("EPUB extraction failed:", error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to extract EPUB",
        });
    }
});
export default router;
