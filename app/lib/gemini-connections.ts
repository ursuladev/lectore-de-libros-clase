import { callGemini } from "./gemini-client";
import type { Book, Quote } from "./reader-store";

export type ConnectionSuggestion = {
  quoteId: string;
  reason: string;
  strength: number;
  sharedTheme: string;
};

export type ConnectionSuggestionsResult = {
  suggestions: ConnectionSuggestion[];
  insight: string;
};

const responseSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quoteId: { type: "string" },
          reason: { type: "string" },
          strength: { type: "integer" },
          sharedTheme: { type: "string" },
        },
        required: ["quoteId", "reason", "strength", "sharedTheme"],
      },
    },
    insight: { type: "string" },
  },
  required: ["suggestions", "insight"],
};

type QuotePayload = {
  id: string;
  text: string;
  tags: string[];
  note?: string;
  bookTitle: string;
  bookAuthor: string;
  bookThemes: string[];
};

function toQuotePayload(quote: Quote, book?: Book): QuotePayload {
  return {
    id: quote.id,
    text: quote.text,
    tags: quote.tags,
    note: quote.note,
    bookTitle: book?.title ?? "Desconocido",
    bookAuthor: book?.author ?? "",
    bookThemes: book?.analysis?.themes ?? [],
  };
}

export async function suggestQuoteConnections(input: {
  centralQuote: Quote;
  candidates: Quote[];
  books: Book[];
}): Promise<ConnectionSuggestionsResult> {
  const booksById = new Map(input.books.map((book) => [book.id, book]));
  const centralBook = booksById.get(input.centralQuote.bookId);
  const central = toQuotePayload(input.centralQuote, centralBook);

  const candidates = input.candidates
    .filter((quote) => quote.id !== input.centralQuote.id)
    .filter((quote) => !input.centralQuote.relatedIds.includes(quote.id))
    .map((quote) => toQuotePayload(quote, booksById.get(quote.bookId)));

  if (candidates.length === 0) {
    return {
      suggestions: [],
      insight: "No hay más citas disponibles para conectar.",
    };
  }

  const prompt = `Eres un asistente literario que ayuda a lectores a unir ideas entre citas.

CITA CENTRAL:
${JSON.stringify(central, null, 2)}

CITAS CANDIDATAS (usa exactamente el campo "id" en quoteId):
${JSON.stringify(candidates, null, 2)}

Encuentra hasta 5 conexiones significativas entre la cita central y las candidatas.
Prioriza resonancia temática, contraste productivo, continuidad de ideas o complemento emocional.
Evita conexiones triviales solo por compartir un tag genérico.

Responde en español.
- strength: 1-10
- sharedTheme: tema compartido en pocas palabras
- insight: párrafo corto sobre el mapa de ideas que se forma`;

  const result = await callGemini<ConnectionSuggestionsResult>({
    prompt,
    schema: responseSchema,
  });

  const validIds = new Set(candidates.map((quote) => quote.id));

  return {
    insight: result.insight,
    suggestions: result.suggestions
      .filter((item) => validIds.has(item.quoteId))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5),
  };
}
