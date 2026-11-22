export interface ChapterCounts {
  chapterId: number;
  position: number;
  total: number;
  completed: number;
}

export interface ChapterProgress extends ChapterCounts {
  remaining: number;
  finished: boolean;
}

export interface BookTranslationProgress {
  bookId: number;
  chapterCount: number;
  completedChapters: number;
  totalBlocks: number;
  translatedBlocks: number;
  remainingBlocks: number;
  percentage: number;
  finished: boolean;
  nextChapterId: number | null;
  chapters: ChapterProgress[];
}

export function buildBookTranslationProgress(
  bookId: number,
  counts: ChapterCounts[]
): BookTranslationProgress {
  const chapters: ChapterProgress[] = counts
    .slice()
    .sort(
      (a, b) =>
        a.position - b.position ||
        a.chapterId - b.chapterId
    )
    .map((chapter) => ({
      ...chapter,
      remaining:
        chapter.total - chapter.completed,
      finished:
        chapter.completed === chapter.total,
    }));

  const totalBlocks = chapters.reduce(
    (sum, chapter) => sum + chapter.total,
    0
  );

  const translatedBlocks = chapters.reduce(
    (sum, chapter) => sum + chapter.completed,
    0
  );

  const remainingBlocks =
    totalBlocks - translatedBlocks;

  const completedChapters = chapters.filter(
    (chapter) => chapter.finished
  ).length;

  const nextChapterId =
    chapters.find(
      (chapter) => chapter.remaining > 0
    )?.chapterId ?? null;

  const finished =
    totalBlocks > 0 && remainingBlocks === 0;

  const percentage =
    totalBlocks > 0
      ? Math.round(
          (translatedBlocks / totalBlocks) * 100
        )
      : 0;

  return {
    bookId,
    chapterCount: chapters.length,
    completedChapters,
    totalBlocks,
    translatedBlocks,
    remainingBlocks,
    percentage,
    finished,
    nextChapterId,
    chapters,
  };
}
