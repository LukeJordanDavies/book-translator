import {
  validateFormattingMarkers,
  type FormattingTag,
} from "./formattingService.js";

export class EmptyTranslationError extends Error {
  constructor() {
    super("The model returned an empty translation");
    this.name = "EmptyTranslationError";
  }
}

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  onRetry?: (
    attempt: number,
    error: unknown
  ) => void;
}

export async function retryTranslationOutput(
  translate: () => Promise<string>,
  expectedTags: FormattingTag[],
  options: RetryOptions = {}
): Promise<string> {
  const {
    maxAttempts = 2,
    baseDelayMs = 1000,
    onRetry,
  } = options;

  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1
  ) {
    throw new Error(
      "maxAttempts must be a positive integer"
    );
  }

  if (
    !Number.isSafeInteger(baseDelayMs) ||
    baseDelayMs < 0
  ) {
    throw new Error(
      "baseDelayMs must be a non-negative integer"
    );
  }

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    let output: string | undefined;
    let problem: unknown;

    try {
      output = await translate();
    } catch (error) {
      // The OpenAI SDK handles temporary API errors.
      // Do not retry them a second time here.
      if (!(error instanceof EmptyTranslationError)) {
        throw error;
      }

      problem = error;
    }

    if (output !== undefined) {
      try {
        if (!output.trim()) {
          throw new EmptyTranslationError();
        }

        validateFormattingMarkers(
          output,
          expectedTags
        );

        return output;
      } catch (error) {
        problem = error;
      }
    }

    if (attempt === maxAttempts) {
      throw new Error(
        `Translation output invalid after ${maxAttempts} attempts`,
        { cause: problem }
      );
    }

    onRetry?.(attempt, problem);

    // Exponential backoff, capped at 4 seconds.
    const delayMs = Math.min(
      baseDelayMs * 2 ** (attempt - 1),
      4000
    );

    if (delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  throw new Error(
    "Translation retry loop exited unexpectedly"
  );
}
