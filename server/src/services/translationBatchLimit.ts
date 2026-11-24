export const DEFAULT_BATCH_LIMIT = 10;

export function getTranslationBatchLimit(
  configuredValue?: string
): number {
  if (
    configuredValue === undefined ||
    configuredValue.trim() === ""
  ) {
    return DEFAULT_BATCH_LIMIT;
  }

  const parsed = Number(configuredValue);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > 1000
  ) {
    throw new Error(
      "TRANSLATION_MAX_BATCHES_PER_RUN must " +
      "be an integer between 1 and 1000"
    );
  }

  return parsed;
}
