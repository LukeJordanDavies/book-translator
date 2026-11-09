import express from "express";
import dotenv from "dotenv";

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
