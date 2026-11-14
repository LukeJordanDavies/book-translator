import { Router } from "express";
import {
  translateText,
  type TranslationOptions,
} from "../services/translationService.js";

const router = Router();

const allowedLanguages = [
  "French",
  "Spanish",
  "German",
  "Italian",
  "English",
  "Japanese",
];

router.post("/", async (req, res) => {
  const { text, settings } = req.body ?? {};

  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 3000
  ) {
    res.status(400).json({
      error: "Text must contain 1–3000 characters",
    });
    return;
  }

  if (
    !settings ||
    !allowedLanguages.includes(settings.targetLanguage) ||
    !["literary", "faithful"].includes(settings.style) ||
    !["previous", "none"].includes(settings.contextMode)
  ) {
    res.status(400).json({
      error: "Invalid translation settings",
    });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({
      error: "OpenAI API key is not configured",
    });
    return;
  }

  try {
    const translatedText = await translateText({
      text,
      settings: settings as TranslationOptions,
    });

    res.json({ translatedText });
  } catch (error) {
    console.error("Translation failed:", error);

    res.status(502).json({
      error: "Translation failed. Check the server logs.",
    });
  }
});

export default router;
