"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConnectionMap from "./connection-map";
import type { ConnectionSuggestion } from "../lib/gemini-connections";
import type { GeneratedCaption } from "../lib/gemini-content";
import {
  Book,
  BookAnalysis,
  Quote,
  ReaderData,
  createId,
  formatTags,
  getBookTagSuggestions,
  loadData,
  mergeTags,
  parseTags,
  saveData,
} from "../lib/reader-store";

type Tab = "libros" | "citas" | "conexiones" | "contenido";

const MOOD_OPTIONS = [
  "ansioso/a",
  "triste",
  "motivado/a",
  "curioso/a",
  "agotado/a",
  "inspirado/a",
  "confundido/a",
  "tranquilo/a",
] as const;

const emptyBook = { title: "", author: "", cover: "" };
const emptyQuote = {
  bookId: "",
  text: "",
  page: "",
  tags: "",
  note: "",
  relatedIds: [] as string[],
  image: "",
};

export default function ReaderDashboard() {
  const [data, setData] = useState<ReaderData>({ books: [], quotes: [] });
  const [tab, setTab] = useState<Tab>("citas");
  const [bookForm, setBookForm] = useState(emptyBook);
  const [quoteForm, setQuoteForm] = useState(emptyQuote);
  const [filterBook, setFilterBook] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [cardStyle, setCardStyle] = useState<"minimal" | "dark" | "warm">(
    "warm",
  );
  const [bookMood, setBookMood] = useState("");
  const [customMood, setCustomMood] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<BookAnalysis | null>(
    null,
  );
  const [reanalyzeBookId, setReanalyzeBookId] = useState<string | null>(null);
  const [connectionSuggestions, setConnectionSuggestions] = useState<
    ConnectionSuggestion[]
  >([]);
  const [connectionInsight, setConnectionInsight] = useState("");
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [generatedCaption, setGeneratedCaption] =
    useState<GeneratedCaption | null>(null);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [captionTone, setCaptionTone] = useState("reflexivo e inspirador");
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(loadData());
  }, []);

  useEffect(() => {
    if (data.books.length || data.quotes.length) {
      saveData(data);
    }
  }, [data]);

  useEffect(() => {
    setConnectionSuggestions([]);
    setConnectionInsight("");
    setConnectionsError(null);
    setGeneratedCaption(null);
    setCaptionError(null);
  }, [selectedQuoteId]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    data.quotes.forEach((q) => q.tags.forEach((t) => tags.add(t)));
    return [...tags].sort();
  }, [data.quotes]);

  const filteredQuotes = useMemo(() => {
    return data.quotes.filter((quote) => {
      if (filterBook && quote.bookId !== filterBook) return false;
      if (filterTag && !quote.tags.includes(filterTag)) return false;
      return true;
    });
  }, [data.quotes, filterBook, filterTag]);

  const selectedQuote = data.quotes.find((q) => q.id === selectedQuoteId);
  const selectedBook = selectedQuote
    ? data.books.find((b) => b.id === selectedQuote.bookId)
    : undefined;

  const quoteBook = data.books.find((b) => b.id === quoteForm.bookId);
  const quoteTagSuggestions = useMemo(
    () => getBookTagSuggestions(quoteBook),
    [quoteBook],
  );
  const activeQuoteTags = useMemo(
    () => new Set(parseTags(quoteForm.tags)),
    [quoteForm.tags],
  );

  const connectionCount = useMemo(
    () => data.quotes.reduce((sum, quote) => sum + quote.relatedIds.length, 0),
    [data.quotes],
  );

  function updateData(updater: (prev: ReaderData) => ReaderData) {
    setData((prev) => updater(prev));
  }

  function handleImageFile(
    file: File | undefined,
    onLoad: (dataUrl: string) => void,
  ) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleQuoteBookChange(bookId: string) {
    const book = data.books.find((item) => item.id === bookId);
    const suggestions = getBookTagSuggestions(book);

    setQuoteForm((current) => ({
      ...current,
      bookId,
      tags: current.tags.trim()
        ? current.tags
        : suggestions.length
          ? formatTags(suggestions)
          : "",
    }));
  }

  function toggleQuoteTag(tag: string) {
    setQuoteForm((current) => {
      const currentTags = parseTags(current.tags);
      const normalized = tag.toLowerCase();
      const nextTags = currentTags.includes(normalized)
        ? currentTags.filter((item) => item !== normalized)
        : [...currentTags, normalized];

      return { ...current, tags: formatTags(nextTags) };
    });
  }

  function applyAllSuggestedTags() {
    if (!quoteTagSuggestions.length) return;
    setQuoteForm((current) => ({
      ...current,
      tags: mergeTags(current.tags, quoteTagSuggestions),
    }));
  }

  function getMoodValue() {
    return customMood.trim() || bookMood;
  }

  function startQuoteForBook(book: Book) {
    const suggestions = getBookTagSuggestions(book);
    setQuoteForm({
      ...emptyQuote,
      bookId: book.id,
      tags: suggestions.length ? formatTags(suggestions) : "",
    });
    setTab("citas");
  }

  async function suggestConnections(
    targetQuote?: Quote,
    quotesOverride?: Quote[],
  ) {
    const central = targetQuote ?? selectedQuote;
    const quotes = quotesOverride ?? data.quotes;

    if (!central) return;

    if (quotes.length < 2) {
      setConnectionsError("Necesitas al menos 2 citas para sugerir conexiones.");
      return;
    }

    setConnectionsLoading(true);
    setConnectionsError(null);

    try {
      const response = await fetch("/api/suggest-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centralQuote: central,
          quotes,
          books: data.books,
        }),
      });

      const payload = (await response.json()) as {
        suggestions?: ConnectionSuggestion[];
        insight?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron sugerir conexiones");
      }

      setConnectionSuggestions(payload.suggestions ?? []);
      setConnectionInsight(payload.insight ?? "");
    } catch (error) {
      setConnectionsError(
        error instanceof Error
          ? error.message
          : "Error al sugerir conexiones",
      );
    } finally {
      setConnectionsLoading(false);
    }
  }

  function applySuggestedConnections() {
    if (!selectedQuote || connectionSuggestions.length === 0) return;

    const ids = connectionSuggestions.map((item) => item.quoteId);

    updateData((prev) => ({
      ...prev,
      quotes: prev.quotes.map((quote) => {
        if (quote.id !== selectedQuote.id) return quote;
        return {
          ...quote,
          relatedIds: [...new Set([...quote.relatedIds, ...ids])],
        };
      }),
    }));
  }

  async function generateCaption() {
    if (!selectedQuote) return;

    setCaptionLoading(true);
    setCaptionError(null);

    try {
      const response = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote: selectedQuote,
          book: selectedBook,
          tone: captionTone,
        }),
      });

      const payload = (await response.json()) as {
        caption?: GeneratedCaption;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo generar el caption");
      }

      if (!payload.caption) {
        throw new Error("Respuesta incompleta de Gemini");
      }

      setGeneratedCaption(payload.caption);
    } catch (error) {
      setCaptionError(
        error instanceof Error ? error.message : "Error al generar caption",
      );
    } finally {
      setCaptionLoading(false);
    }
  }

  function openConnections(quoteId: string) {
    setSelectedQuoteId(quoteId);
    setTab("conexiones");
  }

  function openContent(quoteId: string) {
    setSelectedQuoteId(quoteId);
    setTab("contenido");
  }

  async function analyzeCover(options?: {
    cover?: string;
    mood?: string;
    title?: string;
    author?: string;
    onSuccess?: (analysis: BookAnalysis) => void;
  }) {
    const cover = options?.cover ?? bookForm.cover;
    const mood = options?.mood ?? getMoodValue();
    const title = options?.title ?? bookForm.title;
    const author = options?.author ?? bookForm.author;

    if (!cover) {
      setAiError("Sube una portada para que Gemini la analice.");
      return;
    }

    if (!mood) {
      setAiError("Elige o escribe cómo te sientes hoy.");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch("/api/analyze-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: cover, mood, title, author }),
      });

      const payload = (await response.json()) as {
        analysis?: BookAnalysis;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo analizar la portada");
      }

      if (!payload.analysis) {
        throw new Error("Respuesta incompleta de Gemini");
      }

      if (options?.onSuccess) {
        options.onSuccess(payload.analysis);
      } else {
        setPendingAnalysis(payload.analysis);

        setBookForm((current) => ({
          ...current,
          title: current.title || payload.analysis!.detectedTitle,
          author: current.author || payload.analysis!.detectedAuthor,
        }));
      }
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Error al analizar la portada",
      );
    } finally {
      setAiLoading(false);
    }
  }

  function addBook(e: React.FormEvent) {
    e.preventDefault();
    if (!bookForm.title.trim()) return;

    const book: Book = {
      id: createId(),
      title: bookForm.title.trim(),
      author: bookForm.author.trim(),
      cover: bookForm.cover || undefined,
      analysis: pendingAnalysis || undefined,
      createdAt: new Date().toISOString(),
    };

    updateData((prev) => ({ ...prev, books: [book, ...prev.books] }));
    setBookForm(emptyBook);
    setPendingAnalysis(null);
    setBookMood("");
    setCustomMood("");
    setAiError(null);

    if (book.analysis) {
      startQuoteForBook(book);
    }
  }

  function deleteBook(id: string) {
    updateData((prev) => ({
      books: prev.books.filter((b) => b.id !== id),
      quotes: prev.quotes.filter((q) => q.bookId !== id),
    }));
  }

  function addQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteForm.text.trim() || !quoteForm.bookId) return;

    const quote: Quote = {
      id: createId(),
      bookId: quoteForm.bookId,
      text: quoteForm.text.trim(),
      page: quoteForm.page.trim() || undefined,
      tags: parseTags(quoteForm.tags),
      note: quoteForm.note.trim() || undefined,
      relatedIds: quoteForm.relatedIds,
      image: quoteForm.image || undefined,
      createdAt: new Date().toISOString(),
    };

    updateData((prev) => ({ ...prev, quotes: [quote, ...prev.quotes] }));
    setQuoteForm({ ...emptyQuote, bookId: quoteForm.bookId });
    setSelectedQuoteId(quote.id);
    setTab("conexiones");

    if (data.quotes.length >= 1) {
      void suggestConnections(quote, [quote, ...data.quotes]);
    }
  }

  function deleteQuote(id: string) {
    updateData((prev) => ({
      ...prev,
      quotes: prev.quotes
        .filter((q) => q.id !== id)
        .map((q) => ({
          ...q,
          relatedIds: q.relatedIds.filter((rid) => rid !== id),
        })),
    }));
    if (selectedQuoteId === id) setSelectedQuoteId(null);
  }

  function toggleRelation(quoteId: string, relatedId: string) {
    updateData((prev) => ({
      ...prev,
      quotes: prev.quotes.map((q) => {
        if (q.id !== quoteId) return q;
        const has = q.relatedIds.includes(relatedId);
        return {
          ...q,
          relatedIds: has
            ? q.relatedIds.filter((id) => id !== relatedId)
            : [...q.relatedIds, relatedId],
        };
      }),
    }));
  }

  function getBook(id: string) {
    return data.books.find((b) => b.id === id);
  }

  function getRelatedQuotes(quote: Quote) {
    return quote.relatedIds
      .map((id) => data.quotes.find((q) => q.id === id))
      .filter(Boolean) as Quote[];
  }

  function getQuotesBySharedTags(quote: Quote) {
    return data.quotes.filter(
      (q) =>
        q.id !== quote.id &&
        q.tags.some((tag) => quote.tags.includes(tag)),
    );
  }

  async function downloadCard() {
    if (!cardRef.current || !selectedQuote) return;

    const { width, height } = cardRef.current.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);

    const styles: Record<string, string> = {
      warm: "#f4efe6",
      minimal: "#ffffff",
      dark: "#171717",
    };
    const textColor =
      cardStyle === "dark" ? "#f4f4f5" : "#1c1917";

    ctx.fillStyle = styles[cardStyle];
    ctx.fillRect(0, 0, width, height);

    if (selectedQuote.image) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(0, 0, width, height);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = selectedQuote.image!;
      });
    }

    ctx.fillStyle = textColor;
    ctx.font = 'italic 22px Georgia, "Times New Roman", serif';
    wrapText(ctx, `"${selectedQuote.text}"`, 32, 80, width - 64, 30);

    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle =
      cardStyle === "dark" ? "#d4d4d8" : "#57534e";
    const attribution = selectedBook
      ? `— ${selectedBook.title}${selectedBook.author ? ` · ${selectedBook.author}` : ""}`
      : "";
    ctx.fillText(attribution, 32, height - 40);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cita-${selectedQuote.id.slice(0, 8)}.png`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ) {
    const words = text.split(" ");
    let line = "";
    let currentY = y;

    for (const word of words) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        line = word + " ";
        currentY += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, currentY);
  }

  const cardClasses = {
    warm: "bg-[#f4efe6] text-stone-900",
    minimal: "bg-white text-stone-900 border border-stone-200",
    dark: "bg-stone-900 text-stone-100",
  };

  return (
    <div className="min-h-full bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
              Reader MVP
            </p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">
              Tu biblioteca de citas
            </h1>
            <p className="mt-1 max-w-xl text-sm text-stone-600">
              Libros con Gemini, citas conectadas, mapa de ideas y contenido
              listo para publicar.
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Stat label="Libros" value={data.books.length} />
            <Stat label="Citas" value={data.quotes.length} />
            <Stat label="Links" value={connectionCount} />
            <Stat label="Tags" value={allTags.length} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3">
          {(
            [
              ["libros", "Libros"],
              ["citas", "Citas"],
              ["conexiones", "Conexiones"],
              ["contenido", "Contenido"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                tab === id
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          {tab === "libros" && (
            <>
              <Panel title="Nuevo libro">
                <form onSubmit={addBook} className="space-y-3">
                  <Field
                    label="Título"
                    value={bookForm.title}
                    onChange={(v) => setBookForm({ ...bookForm, title: v })}
                    required
                  />
                  <Field
                    label="Autor"
                    value={bookForm.author}
                    onChange={(v) => setBookForm({ ...bookForm, author: v })}
                  />
                  <label className="block text-xs font-medium text-stone-600">
                    Portada
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-1 block w-full text-xs"
                      onChange={(e) =>
                        handleImageFile(e.target.files?.[0], (cover) => {
                          setBookForm({ ...bookForm, cover });
                          setPendingAnalysis(null);
                        })
                      }
                    />
                  </label>
                  {bookForm.cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bookForm.cover}
                      alt="Vista previa de portada"
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  )}
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
                  >
                    Guardar libro
                  </button>
                </form>
              </Panel>

              <Panel title="Gemini · Analizar portada">
                <p className="mb-3 text-xs leading-relaxed text-stone-600">
                  Sube la portada y cuéntale a Gemini cómo te sientes. Te
                  sugerirá género, temas y si el libro encaja contigo hoy.
                </p>
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-stone-600">
                    ¿Cómo te sientes hoy?
                    <select
                      value={bookMood}
                      onChange={(e) => setBookMood(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Elige un estado</option>
                      {MOOD_OPTIONS.map((mood) => (
                        <option key={mood} value={mood}>
                          {mood}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="O describe tu mood"
                    value={customMood}
                    onChange={setCustomMood}
                    placeholder="ej. necesito calma, quiero retarme"
                  />
                  <button
                    type="button"
                    disabled={aiLoading || !bookForm.cover}
                    onClick={() => analyzeCover()}
                    className="w-full rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 disabled:opacity-40"
                  >
                    {aiLoading ? "Analizando con Gemini..." : "Analizar portada"}
                  </button>
                  {aiError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      {aiError}
                    </p>
                  )}
                  {pendingAnalysis && (
                    <AnalysisPreview analysis={pendingAnalysis} compact />
                  )}
                </div>
              </Panel>
            </>
          )}

          {tab === "citas" && (
            <Panel title="Nueva cita">
              <form onSubmit={addQuote} className="space-y-3">
                <label className="block text-xs font-medium text-stone-600">
                  Libro
                  <select
                    required
                    value={quoteForm.bookId}
                    onChange={(e) => handleQuoteBookChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Elige un libro</option>
                    {data.books.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title}
                      </option>
                    ))}
                  </select>
                </label>

                {quoteBook?.analysis && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                    <p className="text-xs font-medium text-violet-900">
                      Contexto Gemini · encaje {quoteBook.analysis.moodFitScore}/10
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-stone-600">
                      {quoteBook.analysis.readingTip}
                    </p>
                  </div>
                )}

                {quoteTagSuggestions.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-stone-600">
                        Tags sugeridos por Gemini
                      </p>
                      <button
                        type="button"
                        onClick={applyAllSuggestedTags}
                        className="text-xs text-violet-700 underline"
                      >
                        Añadir todos
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {quoteTagSuggestions.map((tag) => {
                        const active = activeQuoteTags.has(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleQuoteTag(tag)}
                            className={`rounded-full px-2.5 py-1 text-xs transition ${
                              active
                                ? "bg-violet-700 text-white"
                                : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-violet-300"
                            }`}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label className="block text-xs font-medium text-stone-600">
                  Cita
                  <textarea
                    required
                    rows={4}
                    value={quoteForm.text}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, text: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    placeholder="La frase que quieres guardar..."
                  />
                </label>
                <Field
                  label="Página"
                  value={quoteForm.page}
                  onChange={(v) => setQuoteForm({ ...quoteForm, page: v })}
                />
                <Field
                  label="Tags (separados por coma)"
                  value={quoteForm.tags}
                  onChange={(v) => setQuoteForm({ ...quoteForm, tags: v })}
                  placeholder="creatividad, hábitos, enfoque"
                />
                <label className="block text-xs font-medium text-stone-600">
                  Nota personal
                  <textarea
                    rows={2}
                    value={quoteForm.note}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, note: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-stone-600">
                  Imagen para contenido (opcional)
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-xs"
                    onChange={(e) =>
                      handleImageFile(e.target.files?.[0], (image) =>
                        setQuoteForm({ ...quoteForm, image }),
                      )
                    }
                  />
                </label>
                <button
                  type="submit"
                  disabled={!data.books.length}
                  className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  Guardar cita
                </button>
              </form>
            </Panel>
          )}

          {tab === "conexiones" && selectedQuote && (
            <>
              <Panel title="Gemini · Unir puntos">
                <p className="mb-3 text-xs leading-relaxed text-stone-600">
                  Gemini analiza el significado de tus citas y sugiere cómo
                  conectan entre sí.
                </p>
                <button
                  type="button"
                  disabled={connectionsLoading || data.quotes.length < 2}
                  onClick={() => suggestConnections()}
                  className="w-full rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 disabled:opacity-40"
                >
                  {connectionsLoading
                    ? "Buscando conexiones..."
                    : "Sugerir conexiones"}
                </button>
                {connectionsError && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {connectionsError}
                  </p>
                )}
                {connectionSuggestions.length > 0 && (
                  <button
                    type="button"
                    onClick={applySuggestedConnections}
                    className="mt-2 w-full rounded-lg bg-violet-700 px-4 py-2 text-xs text-white"
                  >
                    Vincular todas las sugeridas
                  </button>
                )}
              </Panel>

              <Panel title="Vincular citas">
                <p className="mb-3 text-xs text-stone-600">
                  Conecta esta cita con otras para unir ideas.
                </p>
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {data.quotes
                    .filter((q) => q.id !== selectedQuote.id)
                    .map((q) => {
                      const book = getBook(q.bookId);
                      const linked = selectedQuote.relatedIds.includes(q.id);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() =>
                            toggleRelation(selectedQuote.id, q.id)
                          }
                          className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                            linked
                              ? "border-stone-900 bg-stone-900 text-white"
                              : "border-stone-200 bg-white hover:border-stone-400"
                          }`}
                        >
                          <p className="line-clamp-2 font-serif italic">
                            &ldquo;{q.text}&rdquo;
                          </p>
                          <p className="mt-1 opacity-70">{book?.title}</p>
                        </button>
                      );
                    })}
                </div>
              </Panel>
            </>
          )}

          {tab === "contenido" && selectedQuote && (
            <Panel title="Estilo de tarjeta">
              <div className="space-y-3">
                {(["warm", "minimal", "dark"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setCardStyle(style)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm capitalize ${
                      cardStyle === style
                        ? "border-stone-900 bg-stone-100"
                        : "border-stone-200"
                    }`}
                  >
                    {style === "warm"
                      ? "Cálido"
                      : style === "minimal"
                        ? "Minimal"
                        : "Oscuro"}
                  </button>
                ))}
                <label className="block text-xs font-medium text-stone-600">
                  Cambiar imagen de fondo
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-xs"
                    onChange={(e) =>
                      handleImageFile(e.target.files?.[0], (image) => {
                        updateData((prev) => ({
                          ...prev,
                          quotes: prev.quotes.map((q) =>
                            q.id === selectedQuote.id ? { ...q, image } : q,
                          ),
                        }));
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={downloadCard}
                  className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
                >
                  Descargar PNG
                </button>
              </div>
            </Panel>
          )}
        </aside>

        <section className="space-y-4">
          {tab === "libros" && (
            <>
              {data.books.length === 0 ? (
                <Empty
                  title="Empieza con un libro"
                  text="Agrega el primer libro antes de guardar citas."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.books.map((book) => (
                    <article
                      key={book.id}
                      className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
                    >
                      {book.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={book.cover}
                          alt={book.title}
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center bg-stone-100 text-4xl">
                          📖
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold">{book.title}</h3>
                        <p className="text-sm text-stone-600">
                          {book.author || "Autor sin definir"}
                        </p>
                        {book.analysis && (
                          <AnalysisPreview analysis={book.analysis} />
                        )}
                        <p className="mt-2 text-xs text-stone-500">
                          {
                            data.quotes.filter((q) => q.bookId === book.id)
                              .length
                          }{" "}
                          citas
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => startQuoteForBook(book)}
                            className="text-stone-700 underline"
                          >
                            Capturar cita
                          </button>
                          {book.cover && (
                            <button
                              type="button"
                              onClick={() =>
                                setReanalyzeBookId(
                                  reanalyzeBookId === book.id ? null : book.id,
                                )
                              }
                              className="text-violet-700 underline"
                            >
                              {reanalyzeBookId === book.id
                                ? "Cancelar"
                                : "Re-analizar con AI"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteBook(book.id)}
                            className="text-red-600"
                          >
                            Eliminar
                          </button>
                        </div>
                        {reanalyzeBookId === book.id && book.cover && (
                          <div className="mt-4 space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3">
                            <select
                              value={bookMood}
                              onChange={(e) => setBookMood(e.target.value)}
                              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs"
                            >
                              <option value="">Estado de ánimo</option>
                              {MOOD_OPTIONS.map((mood) => (
                                <option key={mood} value={mood}>
                                  {mood}
                                </option>
                              ))}
                            </select>
                            <input
                              value={customMood}
                              onChange={(e) => setCustomMood(e.target.value)}
                              placeholder="O describe tu mood"
                              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs"
                            />
                            <button
                              type="button"
                              disabled={aiLoading}
                              onClick={() =>
                                analyzeCover({
                                  cover: book.cover,
                                  mood: customMood.trim() || bookMood,
                                  title: book.title,
                                  author: book.author,
                                  onSuccess: (analysis) => {
                                    updateData((prev) => ({
                                      ...prev,
                                      books: prev.books.map((item) =>
                                        item.id === book.id
                                          ? { ...item, analysis }
                                          : item,
                                      ),
                                    }));
                                    setReanalyzeBookId(null);
                                    setBookMood("");
                                    setCustomMood("");
                                  },
                                })
                              }
                              className="w-full rounded-lg bg-violet-700 px-3 py-2 text-xs text-white disabled:opacity-40"
                            >
                              {aiLoading ? "Analizando..." : "Analizar ahora"}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "citas" && (
            <>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterBook}
                  onChange={(e) => setFilterBook(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Todos los libros</option>
                  {data.books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>
                <select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Todos los tags</option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      #{tag}
                    </option>
                  ))}
                </select>
              </div>

              {filteredQuotes.length === 0 ? (
                <Empty
                  title="Sin citas todavía"
                  text={
                    data.books.length
                      ? "Captura tu primera cita en el panel izquierdo."
                      : "Primero agrega un libro en la pestaña Libros."
                  }
                />
              ) : (
                <div className="space-y-3">
                  {filteredQuotes.map((quote) => {
                    const book = getBook(quote.bookId);
                    return (
                      <article
                        key={quote.id}
                        className="rounded-2xl border border-stone-200 bg-white p-5"
                      >
                        <p className="font-serif text-lg italic leading-relaxed">
                          &ldquo;{quote.text}&rdquo;
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                          <span className="rounded-full bg-stone-100 px-2 py-1">
                            {book?.title}
                          </span>
                          {quote.page && (
                            <span>p. {quote.page}</span>
                          )}
                          {quote.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-amber-100 px-2 py-1 text-amber-900"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                        {quote.note && (
                          <p className="mt-3 text-sm text-stone-600">
                            {quote.note}
                          </p>
                        )}
                        <div className="mt-4 flex gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => openConnections(quote.id)}
                            className="text-stone-700 underline"
                          >
                            Conectar
                          </button>
                          <button
                            type="button"
                            onClick={() => openContent(quote.id)}
                            className="text-stone-700 underline"
                          >
                            Crear contenido
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteQuote(quote.id)}
                            className="text-red-600"
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "conexiones" && (
            <>
              {!selectedQuote ? (
                <>
                  <Empty
                    title="Elige una cita central"
                    text="Selecciona la cita desde la que quieres explorar conexiones."
                  />
                  {data.quotes.length > 0 && (
                    <div className="space-y-2">
                      {data.quotes.map((quote) => {
                        const book = getBook(quote.bookId);
                        return (
                          <button
                            key={quote.id}
                            type="button"
                            onClick={() => openConnections(quote.id)}
                            className="w-full rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-400"
                          >
                            <p className="font-serif italic leading-relaxed">
                              &ldquo;{quote.text}&rdquo;
                            </p>
                            <p className="mt-2 text-xs text-stone-500">
                              {book?.title}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <article className="rounded-2xl border-2 border-stone-900 bg-white p-5">
                    <p className="text-xs uppercase tracking-widest text-stone-500">
                      Cita central
                    </p>
                    <p className="mt-2 font-serif text-xl italic">
                      &ldquo;{selectedQuote.text}&rdquo;
                    </p>
                    <p className="mt-2 text-sm text-stone-600">
                      {selectedBook?.title}
                      {selectedQuote.tags.length > 0 &&
                        ` · ${selectedQuote.tags.map((t) => `#${t}`).join(" ")}`}
                    </p>
                  </article>

                  <ConnectionMap
                    central={selectedQuote}
                    linked={getRelatedQuotes(selectedQuote)}
                    tagMatches={getQuotesBySharedTags(selectedQuote).filter(
                      (quote) =>
                        !selectedQuote.relatedIds.includes(quote.id) &&
                        !connectionSuggestions.some(
                          (item) => item.quoteId === quote.id,
                        ),
                    )}
                    suggestions={connectionSuggestions}
                    getQuote={(id) => data.quotes.find((quote) => quote.id === id)}
                    getBook={getBook}
                    onSelectQuote={(quoteId) => openConnections(quoteId)}
                  />

                  {connectionInsight && (
                    <Panel title="Insight de Gemini">
                      <p className="text-sm leading-relaxed text-stone-700">
                        {connectionInsight}
                      </p>
                    </Panel>
                  )}

                  {connectionSuggestions.length > 0 && (
                    <Panel title="Sugerencias de Gemini">
                      <div className="space-y-3">
                        {connectionSuggestions.map((suggestion) => {
                          const quote = data.quotes.find(
                            (item) => item.id === suggestion.quoteId,
                          );
                          const book = quote ? getBook(quote.bookId) : undefined;
                          const linked = selectedQuote.relatedIds.includes(
                            suggestion.quoteId,
                          );

                          return (
                            <div
                              key={suggestion.quoteId}
                              className="rounded-xl border border-violet-200 bg-violet-50/50 p-4"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                                  {suggestion.strength}/10 · {suggestion.sharedTheme}
                                </span>
                                <button
                                  type="button"
                                  disabled={linked}
                                  onClick={() =>
                                    toggleRelation(
                                      selectedQuote.id,
                                      suggestion.quoteId,
                                    )
                                  }
                                  className="text-xs text-violet-800 underline disabled:no-underline disabled:opacity-50"
                                >
                                  {linked ? "Vinculada" : "Conectar"}
                                </button>
                              </div>
                              {quote && (
                                <p className="mt-2 font-serif text-sm italic">
                                  &ldquo;{quote.text}&rdquo;
                                </p>
                              )}
                              <p className="mt-1 text-xs text-stone-500">
                                {book?.title}
                              </p>
                              <p className="mt-2 text-xs leading-relaxed text-stone-600">
                                {suggestion.reason}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </Panel>
                  )}

                  <ConnectionBlock
                    title="Citas vinculadas manualmente"
                    empty="Aún no conectaste otras citas. Usa el panel izquierdo."
                    quotes={getRelatedQuotes(selectedQuote)}
                    getBook={getBook}
                  />

                  <ConnectionBlock
                    title="Conexiones por tags compartidos"
                    empty="No hay otras citas con los mismos tags."
                    quotes={getQuotesBySharedTags(selectedQuote)}
                    getBook={getBook}
                  />

                  {selectedQuote.note && (
                    <Panel title="Tu nota">
                      <p className="text-sm text-stone-700">
                        {selectedQuote.note}
                      </p>
                    </Panel>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "contenido" && (
            <>
              {!selectedQuote ? (
                <>
                  <Empty
                    title="Elige una cita"
                    text="Selecciona la cita que quieres convertir en contenido visual."
                  />
                  {data.quotes.length > 0 && (
                    <div className="space-y-2">
                      {data.quotes.map((quote) => {
                        const book = getBook(quote.bookId);
                        return (
                          <button
                            key={quote.id}
                            type="button"
                            onClick={() => openContent(quote.id)}
                            className="w-full rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-400"
                          >
                            <p className="font-serif italic leading-relaxed">
                              &ldquo;{quote.text}&rdquo;
                            </p>
                            <p className="mt-2 text-xs text-stone-500">
                              {book?.title}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div
                    ref={cardRef}
                    className={`relative flex min-h-[420px] flex-col justify-between overflow-hidden rounded-2xl p-8 shadow-lg ${cardClasses[cardStyle]}`}
                  >
                    {selectedQuote.image && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedQuote.image}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/45" />
                      </>
                    )}
                    <div className="relative z-10">
                      <p
                        className={`font-serif text-2xl italic leading-relaxed ${
                          selectedQuote.image ? "text-white" : ""
                        }`}
                      >
                        &ldquo;{selectedQuote.text}&rdquo;
                      </p>
                    </div>
                    <div
                      className={`relative z-10 text-sm ${
                        selectedQuote.image
                          ? "text-stone-200"
                          : "text-stone-600"
                      }`}
                    >
                      {selectedBook && (
                        <>
                          <p className="font-medium">{selectedBook.title}</p>
                          {selectedBook.author && (
                            <p>{selectedBook.author}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <Panel title="Gemini · Caption">
                    <div className="space-y-3">
                      <Field
                        label="Tono del post"
                        value={captionTone}
                        onChange={setCaptionTone}
                        placeholder="reflexivo e inspirador"
                      />
                      <button
                        type="button"
                        disabled={captionLoading}
                        onClick={generateCaption}
                        className="w-full rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 disabled:opacity-40"
                      >
                        {captionLoading
                          ? "Generando caption..."
                          : "Generar con Gemini"}
                      </button>
                      {captionError && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                          {captionError}
                        </p>
                      )}
                      {generatedCaption && (
                        <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                          <p className="text-xs font-medium text-violet-900">
                            Hook
                          </p>
                          <p className="text-sm text-stone-800">
                            {generatedCaption.hook}
                          </p>
                          <p className="text-xs font-medium text-violet-900">
                            Caption
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                            {generatedCaption.caption}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {generatedCaption.hashtags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-600"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              navigator.clipboard.writeText(
                                `${generatedCaption.hook}\n\n${generatedCaption.caption}\n\n${generatedCaption.hashtags.map((tag) => `#${tag}`).join(" ")}`,
                              )
                            }
                            className="w-full rounded-lg bg-violet-700 px-3 py-2 text-xs text-white"
                          >
                            Copiar caption AI
                          </button>
                        </div>
                      )}
                    </div>
                  </Panel>

                  <Panel title="Texto para publicar">
                    <textarea
                      readOnly
                      rows={10}
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
                      value={`"${selectedQuote.text}"\n\n— ${selectedBook?.title ?? "Libro"}${selectedBook?.author ? `, ${selectedBook.author}` : ""}${selectedQuote.page ? `\nPág. ${selectedQuote.page}` : ""}${selectedQuote.tags.length ? `\n\n${selectedQuote.tags.map((t) => `#${t}`).join(" ")}` : ""}${selectedQuote.note ? `\n\n${selectedQuote.note}` : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          `"${selectedQuote.text}"\n\n— ${selectedBook?.title ?? "Libro"}`,
                        )
                      }
                      className="mt-3 rounded-lg border border-stone-300 px-4 py-2 text-sm"
                    >
                      Copiar caption
                    </button>
                  </Panel>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-stone-500">{label}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-medium text-stone-600">
      {label}
      <input
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-stone-600">{text}</p>
    </div>
  );
}

function ConnectionBlock({
  title,
  empty,
  quotes,
  getBook,
}: {
  title: string;
  empty: string;
  quotes: Quote[];
  getBook: (id: string) => Book | undefined;
}) {
  return (
    <Panel title={title}>
      {quotes.length === 0 ? (
        <p className="text-sm text-stone-500">{empty}</p>
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => {
            const book = getBook(quote.bookId);
            return (
              <div
                key={quote.id}
                className="rounded-xl border border-stone-200 bg-stone-50 p-4"
              >
                <p className="font-serif italic">&ldquo;{quote.text}&rdquo;</p>
                <p className="mt-2 text-xs text-stone-600">
                  {book?.title}
                  {quote.tags.length > 0 &&
                    ` · ${quote.tags.map((t) => `#${t}`).join(" ")}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function AnalysisPreview({
  analysis,
  compact = false,
}: {
  analysis: BookAnalysis;
  compact?: boolean;
}) {
  const scoreColor =
    analysis.moodFitScore >= 8
      ? "text-emerald-700 bg-emerald-50"
      : analysis.moodFitScore >= 5
        ? "text-amber-800 bg-amber-50"
        : "text-rose-700 bg-rose-50";

  return (
    <div
      className={`rounded-xl border border-violet-200 bg-violet-50/70 ${compact ? "p-3" : "mt-3 p-4"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
          Análisis Gemini
        </p>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${scoreColor}`}
        >
          Encaje {analysis.moodFitScore}/10
        </span>
      </div>
      <p className="mt-2 text-xs text-stone-600">
        Mood: <span className="font-medium">{analysis.mood}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {analysis.genres.map((genre) => (
          <span
            key={genre}
            className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-700"
          >
            {genre}
          </span>
        ))}
      </div>
      {!compact && analysis.themes.length > 0 && (
        <p className="mt-2 text-xs text-stone-600">
          Temas: {analysis.themes.join(" · ")}
        </p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-stone-700">
        {analysis.summary}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-stone-600">
        {analysis.moodReason}
      </p>
      <p className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-xs text-stone-700">
        <span className="font-medium">Tip:</span> {analysis.readingTip}
      </p>
      {analysis.suggestedTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {analysis.suggestedTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
