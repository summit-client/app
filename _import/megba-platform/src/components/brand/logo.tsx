import Link from "next/link";
import { cn } from "@/lib/utils";
import { org } from "@/content/site";

/**
 * Official MEGBA logo (vector lockup). Served from /public so it stays crisp at
 * any size. On dark surfaces (footer) it sits on a white chip so the wordmark
 * reads. The favicon lives at src/app/icon.svg.
 */
export function Logo({ className, footer = false }: { className?: string; footer?: boolean }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-megba.svg"
      alt={org.name}
      width={795}
      height={300}
      className={cn("w-auto", footer ? "h-10" : "h-11 sm:h-12")}
    />
  );

  return (
    <Link
      href="/"
      className={cn("inline-flex items-center", className)}
      aria-label={`${org.name}, home`}
    >
      {footer ? <span className="inline-flex rounded-lg bg-white px-3 py-2">{img}</span> : img}
    </Link>
  );
}
