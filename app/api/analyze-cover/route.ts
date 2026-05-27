import { NextRequest, NextResponse } from "next/server";
import { analyzeBookCover } from "../../lib/gemini-cover";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      image?: string;
      mood?: string;
      title?: string;
      author?: string;
    };

    if (!body.image?.trim()) {
      return NextResponse.json(
        { error: "Sube una portada para analizar" },
        { status: 400 },
      );
    }

    if (!body.mood?.trim()) {
      return NextResponse.json(
        { error: "Indica cómo te sientes hoy" },
        { status: 400 },
      );
    }

    const analysis = await analyzeBookCover({
      imageDataUrl: body.image,
      mood: body.mood.trim(),
      title: body.title?.trim() || undefined,
      author: body.author?.trim() || undefined,
    });

    return NextResponse.json({ analysis });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al analizar la portada";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
