import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBookTranslationProgress,
} from "../services/bookTranslationProgress.js";

test("calculates initial book progress", () => {
  const result = buildBookTranslationProgress(
    1,
    [
      {
        chapterId: 10,
        position: 0,
        total: 6,
        completed: 0,
      },
      {
        chapterId: 11,
        position: 1,
        total: 4,
        completed: 0,
      },
    ]
  );

  assert.equal(result.totalBlocks, 10);
  assert.equal(result.translatedBlocks, 0);
  assert.equal(result.remainingBlocks, 10);
  assert.equal(result.percentage, 0);
  assert.equal(result.nextChapterId, 10);
  assert.equal(result.finished, false);
});

test("skips completed chapters", () => {
  const result = buildBookTranslationProgress(
    1,
    [
      {
        chapterId: 10,
        position: 0,
        total: 6,
        completed: 6,
      },
      {
        chapterId: 11,
        position: 1,
        total: 4,
        completed: 2,
      },
    ]
  );

  assert.equal(result.translatedBlocks, 8);
  assert.equal(result.remainingBlocks, 2);
  assert.equal(result.percentage, 80);
  assert.equal(result.nextChapterId, 11);
  assert.equal(result.completedChapters, 1);
});

test("recognises a completely translated book", () => {
  const result = buildBookTranslationProgress(
    1,
    [
      {
        chapterId: 10,
        position: 0,
        total: 6,
        completed: 6,
      },
      {
        chapterId: 11,
        position: 1,
        total: 4,
        completed: 4,
      },
    ]
  );

  assert.equal(result.percentage, 100);
  assert.equal(result.remainingBlocks, 0);
  assert.equal(result.nextChapterId, null);
  assert.equal(result.finished, true);
});

test("handles books without translatable blocks", () => {
  const result = buildBookTranslationProgress(
    1,
    [
      {
        chapterId: 10,
        position: 0,
        total: 0,
        completed: 0,
      },
    ]
  );

  assert.equal(result.totalBlocks, 0);
  assert.equal(result.percentage, 0);
  assert.equal(result.nextChapterId, null);
  assert.equal(result.finished, false);
});
