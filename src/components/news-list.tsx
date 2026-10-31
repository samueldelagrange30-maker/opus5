import { formatDate } from "@/lib/format";
import type { NewsItem } from "@/lib/types";
import { GameBadge } from "./ui";

export function NewsList({ items }: { items: NewsItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((n) => (
        <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer" className="group panel panel-hover flex gap-3 p-3">
          {n.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.image} alt="" loading="lazy" className="h-20 w-28 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold group-hover:text-white">{n.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-400">{n.game && <GameBadge game={n.game} />}{n.source} · {formatDate(n.publishedAt)}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
