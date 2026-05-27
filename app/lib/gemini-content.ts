import { callGemini } from "./gemini-client";
import type { Book, Quote } from "./reader-store";

export type GeneratedCaption = {
  hook: string;
  caption: string;
  hashtags: string[];
};

const responseSchema = {
  type: "object",
  properties: {
    hook: { type: "string" },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
  },
  required: ["hook", "caption", "hashtags"],
};

export async function generateQuoteCaption(input: {
  quote: Quote;
  book?: Book;
  tone?: string;
}): Promise<GeneratedCaption> {
  const context = {
    quote: input.quote.text,
    page: input.quote.page,
    tags: input.quote.tags,
    note: input.quote.note,
    bookTitle: input.book?.title,
    bookAuthor: input.book?.author,
    genres: input.book?.analysis?.genres ?? [],
    themes: input.book?.analysis?.themes ?? [],
    tone: input.tone ?? "reflexivo e inspirador",
  };

  const prompt = `Eres un creador de contenido literario en español.

Genera copy listo para publicar en Instagram o LinkedIn a partir de esta cita:

${JSON.stringify(context, null, 2)}

Reglas:
- hook: primera línea que detenga el scroll (máx 12 palabras)
- caption: 2-4 frases con contexto emocional + la cita integrada o citada
- hashtags: 5-8 tags relevantes sin el símbolo #, en minúsculas
- Tono: ${context.tone}
- No uses emojis excesivos (máximo 1)`;

  return callGemini<GeneratedCaption>({ prompt, schema: responseSchema });
}
