import type { Book, Quote } from "../lib/reader-store";
import type { ConnectionSuggestion } from "../lib/gemini-connections";

type MapNode = {
  quote: Quote;
  kind: "central" | "linked" | "suggested" | "tag";
  reason?: string;
  strength?: number;
};

function truncate(text: string, max = 72) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function ConnectionMap({
  central,
  linked,
  tagMatches,
  suggestions,
  getQuote,
  getBook,
  onSelectQuote,
}: {
  central: Quote;
  linked: Quote[];
  tagMatches: Quote[];
  suggestions: ConnectionSuggestion[];
  getQuote: (id: string) => Quote | undefined;
  getBook: (id: string) => Book | undefined;
  onSelectQuote: (quoteId: string) => void;
}) {
  const usedIds = new Set<string>([central.id]);
  const nodes: MapNode[] = [{ quote: central, kind: "central" }];

  for (const quote of linked) {
    if (usedIds.has(quote.id)) continue;
    usedIds.add(quote.id);
    nodes.push({ quote, kind: "linked" });
  }

  for (const suggestion of suggestions) {
    const quote = getQuote(suggestion.quoteId);
    if (!quote || usedIds.has(quote.id)) continue;
    usedIds.add(quote.id);
    nodes.push({
      quote,
      kind: "suggested",
      reason: suggestion.reason,
      strength: suggestion.strength,
    });
  }

  for (const quote of tagMatches) {
    if (usedIds.has(quote.id)) continue;
    usedIds.add(quote.id);
    nodes.push({ quote, kind: "tag" });
  }

  const satellites = nodes.slice(1);

  if (satellites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-stone-700">
          Aún no hay conexiones visibles
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Vincula citas manualmente o pide sugerencias a Gemini.
        </p>
      </div>
    );
  }

  const radius = satellites.length > 4 ? 150 : 125;

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-stone-800">Mapa de conexiones</p>
        <div className="flex flex-wrap gap-2 text-[11px] text-stone-600">
          <Legend color="bg-stone-900" label="Central" />
          <Legend color="bg-emerald-500" label="Vinculada" />
          <Legend color="bg-violet-500" label="Sugerida AI" />
          <Legend color="bg-amber-400" label="Por tag" />
        </div>
      </div>

      <div className="relative mx-auto h-[360px] w-full max-w-[520px]">
        <svg
          viewBox="0 0 520 360"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {satellites.map((node, index) => {
            const angle =
              (index / satellites.length) * Math.PI * 2 - Math.PI / 2;
            const x = 260 + Math.cos(angle) * radius;
            const y = 180 + Math.sin(angle) * radius;
            const stroke =
              node.kind === "linked"
                ? "#10b981"
                : node.kind === "suggested"
                  ? "#7c3aed"
                  : "#f59e0b";

            return (
              <line
                key={`line-${node.quote.id}`}
                x1="260"
                y1="180"
                x2={x}
                y2={y}
                stroke={stroke}
                strokeWidth={node.kind === "linked" ? 2.5 : 1.5}
                strokeDasharray={node.kind === "linked" ? undefined : "5 4"}
                opacity={0.8}
              />
            );
          })}
        </svg>

        <div className="absolute left-1/2 top-1/2 z-20 w-[220px] -translate-x-1/2 -translate-y-1/2">
          <MapCard
            node={{ quote: central, kind: "central" }}
            book={getBook(central.bookId)}
            onSelect={() => onSelectQuote(central.id)}
          />
        </div>

        {satellites.map((node, index) => {
          const angle =
            (index / satellites.length) * Math.PI * 2 - Math.PI / 2;
          const x = 260 + Math.cos(angle) * radius;
          const y = 180 + Math.sin(angle) * radius;

          return (
            <div
              key={node.quote.id}
              className="absolute z-10 w-[170px] -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(x / 520) * 100}%`,
                top: `${(y / 360) * 100}%`,
              }}
            >
              <MapCard
                node={node}
                book={getBook(node.quote.bookId)}
                onSelect={() => onSelectQuote(node.quote.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function MapCard({
  node,
  book,
  onSelect,
}: {
  node: MapNode;
  book?: Book;
  onSelect: () => void;
}) {
  const ring =
    node.kind === "central"
      ? "ring-stone-900"
      : node.kind === "linked"
        ? "ring-emerald-500"
        : node.kind === "suggested"
          ? "ring-violet-500"
          : "ring-amber-400";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl bg-white p-3 text-left shadow-sm ring-2 ${ring} transition hover:shadow-md`}
    >
      <p className="text-[10px] uppercase tracking-wide text-stone-500">
        {node.kind === "central"
          ? "Central"
          : node.kind === "linked"
            ? "Vinculada"
            : node.kind === "suggested"
              ? `AI · ${node.strength ?? "?"}/10`
              : "Tag"}
      </p>
      <p className="mt-1 line-clamp-3 font-serif text-xs italic leading-snug text-stone-800">
        &ldquo;{truncate(node.quote.text)}&rdquo;
      </p>
      <p className="mt-1 text-[10px] text-stone-500">{book?.title}</p>
      {node.reason && (
        <p className="mt-1 line-clamp-2 text-[10px] text-violet-700">
          {node.reason}
        </p>
      )}
    </button>
  );
}
