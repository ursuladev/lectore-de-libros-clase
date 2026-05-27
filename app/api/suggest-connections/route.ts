import { NextRequest, NextResponse } from "next/server";
import { suggestQuoteConnections } from "../../lib/gemini-connections";
import type { Book, Quote } from "../../lib/reader-store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      centralQuote?: Quote;
      quotes?: Quote[];
      books?: Book[];
    };

    if (!body.centralQuote?.id || !body.quotes?.length) {
      return NextResponse.json(
        { error: "Se necesita una cita central y al menos otra cita" },
        { status: 400 },
      );
    }

    const result = await suggestQuoteConnections({
      centralQuote: body.centralQuote,
      candidates: body.quotes,
      books: body.books ?? [],
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error al sugerir conexiones";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
