export type BookAnalysis = {
  detectedTitle: string;
  detectedAuthor: string;
  genres: string[];
  themes: string[];
  summary: string;
  mood: string;
  moodFitScore: number;
  moodReason: string;
  readingTip: string;
  suggestedTags: string[];
  analyzedAt: string;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  cover?: string;
  analysis?: BookAnalysis;
  createdAt: string;
};

export type Quote = {
  id: string;
  bookId: string;
  text: string;
  page?: string;
  tags: string[];
  note?: string;
  relatedIds: string[];
  image?: string;
  createdAt: string;
};

export type ReaderData = {
  books: Book[];
  quotes: Quote[];
};

const STORAGE_KEY = "reader-dashboard";

export function createId() {
  return crypto.randomUUID();
}

export function loadData(): ReaderData {
  if (typeof window === "undefined") {
    return { books: [], quotes: [] };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { books: [], quotes: [] };
    return JSON.parse(raw) as ReaderData;
  } catch {
    return { books: [], quotes: [] };
  }
}

export function saveData(data: ReaderData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function parseTags(input: string) {
  return input
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export function formatTags(tags: string[]) {
  return tags.join(", ");
}

export function mergeTags(existing: string, toAdd: string[]) {
  const merged = [
    ...new Set([...parseTags(existing), ...toAdd.map((tag) => tag.toLowerCase())]),
  ];
  return formatTags(merged);
}

export function getBookTagSuggestions(book?: Book) {
  if (!book?.analysis) return [];

  const suggestions = [
    ...book.analysis.suggestedTags,
    ...book.analysis.genres,
    ...book.analysis.themes,
  ];

  return [
    ...new Set(
      suggestions
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
