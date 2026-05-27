import { callGemini, parseDataUrl } from "./gemini-client";

export type CoverAnalysisResult = {
  detectedTitle: string;
  detectedAuthor: string;
  genres: string[];
  themes: string[];
  summary: string;
  moodFitScore: number;
  moodReason: string;
  readingTip: string;
  suggestedTags: string[];
};

export type BookAnalysis = CoverAnalysisResult & {
  mood: string;
  analyzedAt: string;
};

const responseSchema = {
  type: "object",
  properties: {
    detectedTitle: { type: "string" },
    detectedAuthor: { type: "string" },
    genres: { type: "array", items: { type: "string" } },
    themes: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    moodFitScore: { type: "integer" },
    moodReason: { type: "string" },
    readingTip: { type: "string" },
    suggestedTags: { type: "array", items: { type: "string" } },
  },
  required: [
    "detectedTitle",
    "detectedAuthor",
    "genres",
    "themes",
    "summary",
    "moodFitScore",
    "moodReason",
    "readingTip",
    "suggestedTags",
  ],
};

export function buildCoverPrompt(
  mood: string,
  title?: string,
  author?: string,
) {
  const hints = [
    title ? `Título indicado por el usuario: ${title}` : null,
    author ? `Autor indicado por el usuario: ${author}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `Eres un asistente literario experto. Analiza la portada del libro en la imagen.

El lector hoy se siente: "${mood}"
${hints ? `\n${hints}\n` : ""}
Tareas:
1. Identifica título y autor visibles en la portada (si no aparecen, infiere con cautela o deja string vacío).
2. Clasifica el libro por géneros literarios (2-4).
3. Extrae temas centrales (2-4).
4. Resume en 2-3 frases de qué trata el libro.
5. Evalúa qué tan adecuado es para alguien que se siente "${mood}" (moodFitScore 1-10).
6. Explica por qué encaja o no con ese estado emocional.
7. Da un consejo práctico de lectura para ese momento.
8. Sugiere tags cortos en minúsculas para organizar citas.

Responde en español, tono cálido y directo.`;
}

export async function analyzeBookCover(input: {
  imageDataUrl: string;
  mood: string;
  title?: string;
  author?: string;
}): Promise<BookAnalysis> {
  const { mimeType, data } = parseDataUrl(input.imageDataUrl);

  const parsed = await callGemini<CoverAnalysisResult>({
    prompt: buildCoverPrompt(input.mood, input.title, input.author),
    schema: responseSchema,
    image: { mimeType, data },
  });

  return {
    ...parsed,
    mood: input.mood,
    analyzedAt: new Date().toISOString(),
  };
}
