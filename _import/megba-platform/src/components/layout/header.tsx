"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, ArrowRight } from "lucide-react";
import { mainNav, type NavItem } from "@/content/site";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const navRef = React.useRef<HTMLElement>(null);

  // Close menus on route change.
  React.useEffect(() => {
    setOpenIndex(null);
    setMobileOpen(false);
  }, [pathname]);

  // Close on Escape / outside click.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenIndex(null);
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenIndex(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 border-t-[3px] border-t-maple bg-ivory/85 backdrop-blur supports-[backdrop-filter]:bg-ivory/70">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo />

        {/* Desktop nav */}
        <nav ref={navRef} aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {mainNav.map((item, i) => (
              <li key={item.label} className="static">
                {item.columns ? (
                  <button
                    type="button"
                    aria-expanded={openIndex === i}
                    aria-haspopup="true"
                    onClick={() => setOpenIndex(openIndex === i ? null : i)}
                    onMouseEnter={() => setOpenIndex(i)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium text-charcoal/90 hover:bg-forest/5 hover:text-forest",
                      openIndex === i && "bg-forest/5 text-forest",
                    )}
                  >
                    {item.label}
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", openIndex === i && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                ) : (
                  <Link
                    href={item.href ?? "#"}
                    className="inline-flex items-center rounded-full px-3.5 py-2 text-sm font-medium text-charcoal/90 hover:bg-forest/5 hover:text-forest"
                  >
                    {item.label}
                  </Link>
                )}
                {item.columns && openIndex === i ? (
                  <MegaPanel item={item} onClose={() => setOpenIndex(null)} />
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-1.5 lg:flex">
          <LanguageSwitcher compact />
          <Link
            href="/portal"
            className="rounded-full px-3.5 py-2 text-sm font-medium text-forest hover:bg-forest/5"
          >
            Sign in
          </Link>
          <Button href="/partners/become-a-partner" size="sm">
            Partner With MEGBA
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-forest lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen ? <MobileNav onNavigate={() => setMobileOpen(false)} /> : null}
    </header>
  );
}

function MegaPanel({ item, onClose }: { item: NavItem; onClose: () => void }) {
  return (
    <div
      onMouseLeave={onClose}
      className="absolute inset-x-0 top-full z-40 hidden animate-fade-in border-b border-border bg-card shadow-lift lg:block"
    >
      <div className="container grid gap-8 py-8 md:grid-cols-[1fr_1fr_0.9fr]">
        {item.columns!.map((col) => (
          <div key={col.heading}>
            <p className="eyebrow mb-3">{col.heading}</p>
            <ul className="space-y-1">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-md px-3 py-2 hover:bg-forest/5"
                    onClick={onClose}
                  >
                    <span className="block text-sm font-medium text-charcoal">{link.label}</span>
                    {link.description ? (
                      <span className="block text-xs text-muted-foreground">{link.description}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {item.feature ? (
          <Link
            href={item.feature.href}
            onClick={onClose}
            className="group flex flex-col justify-between rounded-lg bg-forest p-6 text-primary-foreground"
          >
            <div>
              <p className="text-lg font-semibold">{item.feature.title}</p>
              <p className="mt-2 text-sm text-primary-foreground/80">{item.feature.body}</p>
            </div>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium">
              {item.feature.cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="border-t border-border bg-ivory lg:hidden">
      <nav aria-label="Mobile" className="container max-h-[75vh] overflow-auto py-4">
        <ul className="space-y-1">
          {mainNav.map((item) => (
            <li key={item.label}>
              {item.columns ? (
                <details className="group rounded-lg">
                  <summary className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-3 text-base font-medium marker:content-none hover:bg-forest/5">
                    {item.label}
                    <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-4 px-3 pb-3 pt-1">
                    {item.columns.map((col) => (
                      <div key={col.heading}>
                        <p className="eyebrow mb-1.5">{col.heading}</p>
                        <ul className="space-y-0.5">
                          {col.links.map((link) => (
                            <li key={link.href}>
                              <Link
                                href={link.href}
                                onClick={onNavigate}
                                className="block rounded-md px-2 py-2 text-sm text-charcoal/90 hover:bg-forest/5"
                              >
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <Link
                  href={item.href ?? "#"}
                  onClick={onNavigate}
                  className="block rounded-lg px-3 py-3 text-base font-medium hover:bg-forest/5"
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <div className="px-1">
            <LanguageSwitcher />
          </div>
          <Button href="/portal" variant="outline" onClick={onNavigate}>
            Sign in
          </Button>
          <Button href="/partners/become-a-partner" onClick={onNavigate}>
            Partner With MEGBA
          </Button>
        </div>
      </nav>
    </div>
  );
}
