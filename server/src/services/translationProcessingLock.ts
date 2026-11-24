import type {
  TranslationOptions,
} from "./translationService.js";

// Locks shared by the server-side worker
// and the existing translation API routes.
const activeTranslations = new Set<string>();

function createLockKey(
  bookId: number,
  settings: TranslationOptions
): string {
  return JSON.stringify([
    bookId,
    settings.targetLanguage,
    settings.style,
    settings.contextMode,
  ]);
}

export function acquireTranslationLock(
  bookId: number,
  settings: TranslationOptions
): (() => void) | null {
  const key = createLockKey(bookId, settings);

  if (activeTranslations.has(key)) {
    return null;
  }

  activeTranslations.add(key);

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    activeTranslations.delete(key);
  };
}

export function isTranslationLocked(
  bookId: number,
  settings: TranslationOptions
): boolean {
  return activeTranslations.has(
    createLockKey(bookId, settings)
  );
}
