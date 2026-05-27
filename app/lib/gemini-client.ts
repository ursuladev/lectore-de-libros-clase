export const GEMINI_MODEL = "gemini-2.5-flash";

type GeminiImage = {
  mimeType: string;
  data: string;
};

type GeminiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function formatGeminiError(status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as GeminiErrorPayload;
    const message = parsed.error?.message ?? body;
    const code = parsed.error?.code ?? status;

    if (code === 429 || parsed.error?.status === "RESOURCE_EXHAUSTED") {
      return "Cuota de Gemini agotada. Espera un minuto o revisa tu plan en Google AI Studio.";
    }

    if (code === 404) {
      return "Modelo de Gemini no disponible. Revisa la configuración del proyecto.";
    }

    if (code === 400 && message.toLowerCase().includes("api key")) {
      return "API key de Gemini inválida. Revisa GEMINI_API_KEY en .env.local.";
    }

    return message;
  } catch {
    return `Gemini API error (${status}): ${body}`;
  }
}

export async function callGemini<T>(input: {
  prompt: string;
  schema?: Record<string, unknown>;
  image?: GeminiImage;
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada en .env.local");
  }

  const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
  if (input.image) {
    parts.push({
      inline_data: {
        mime_type: input.image.mimeType,
        data: input.image.data,
      },
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          ...(input.schema ? { responseSchema: input.schema } : {}),
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(formatGeminiError(response.status, errorBody));
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini no devolvió una respuesta válida");
  }

  return JSON.parse(text) as T;
}

export function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error("Formato de imagen inválido");
  }

  return { mimeType: match[1], data: match[2] };
}
