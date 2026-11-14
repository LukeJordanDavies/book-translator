import { Router } from "express";
import multer from "multer";
import { extractEpub } from "../epub/extractEpub.js";
import { saveBook, getAllBooks, getBookById, deleteBook } from "../database/bookRepository.js";

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

    const bookId = saveBook(
      book,
      req.file.originalname,
      req.file.buffer
    );

    res.json({
      message: "EPUB import successfully",
      bookId,
      filename: req.file.originalname,
      book,
    });
  } catch (error) {
    console.error("EPUB import failed:", error);

    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to import EPUB",
    });
  }
});


router.get("/", (_req, res) => {
  try {
    const books = getAllBooks();
    res.json(books);
  } catch (error) {
    console.error("Failed to load books:", error);

    res.status(500).json({
      error: "Failed to load library",
    });
  }
});

router.get("/:id", (req, res) => {
  const bookId = Number(req.params.id);

  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  try {
    const book = getBookById(bookId);

    if (!book) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    res.json(book);
  } catch (error) {
    console.error("Failed to load book:", error);

    res.status(500).json({
      error: "Failed to load book",
    });
  }
});


router.delete("/:id", (req, res) => {
  const bookId = Number(req.params.id);

  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    res.status(400).json({
      error: "Invalid book ID",
    });
    return;
  }

  try {
    const deleted = deleteBook(bookId);

    if (!deleted) {
      res.status(404).json({
        error: "Book not found",
      });
      return;
    }

    res.json({
      message: "Book deleted successfully",
      bookId,
    });
  } catch (error) {
    console.error("Failed to delete book:", error);

    res.status(500).json({
      error: "Failed to delete book",
    });
  }
});


export default router;
