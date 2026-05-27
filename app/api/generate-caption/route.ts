import { NextRequest, NextResponse } from "next/server";
import { generateQuoteCaption } from "../../lib/gemini-content";
import type { Book, Quote } from "../../lib/reader-store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      quote?: Quote;
      book?: Book;
      tone?: string;
    };

    if (!body.quote?.text) {
      return NextResponse.json(
        { error: "Se necesita una cita válida" },
        { status: 400 },
      );
    }

    const caption = await generateQuoteCaption({
      quote: body.quote,
      book: body.book,
      tone: body.tone,
    });

    return NextResponse.json({ caption });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al generar caption";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
