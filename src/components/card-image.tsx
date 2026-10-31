import Image from "next/image";
import { clsx } from "clsx";

const OPTIMIZED_HOSTS = ["assets.tcgdex.net", "images.pokemontcg.io", "optcgapi.com", "www.optcgapi.com", "en.onepiece-cardgame.com"];

function optimizable(src: string) {
  try {
    const h = new URL(src).hostname;
    return OPTIMIZED_HOSTS.includes(h) || h.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

// Image de carte au format 63×88 mm, chargement différé et formats modernes (AVIF/WebP).
export function CardImage({ src, alt, sizes = "(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 220px", priority, className }: { src: string | null; alt: string; sizes?: string; priority?: boolean; className?: string }) {
  return (
    <div className={clsx("card-shine relative aspect-[63/88] w-full overflow-hidden rounded-[4.5%/3.2%] bg-ink-800", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={!optimizable(src)} className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center p-3 text-center text-xs text-ink-400">Image indisponible</div>
      )}
    </div>
  );
}
