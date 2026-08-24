import Link from "next/link";
import { Mail, Linkedin, Youtube } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { footerNav, legalNav, org, careDisclaimer } from "@/content/site";

export function Footer() {
  const year = 2026; // static to avoid runtime Date; update in CMS/site config.
  return (
    <footer className="border-t border-forest-700/40 bg-forest-900 text-primary-foreground">
      <div className="container py-14">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_2.7fr]">
          <div>
            <Logo footer />
            <p className="mt-4 max-w-xs text-sm text-primary-foreground/70">{org.description}</p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href={`mailto:${org.email}`}
                className="rounded-full bg-white/10 p-2 hover:bg-white/20"
                aria-label="Email MEGBA"
              >
                <Mail className="h-4 w-4" aria-hidden />
              </a>
              <a
                href={org.social.linkedin}
                className="rounded-full bg-white/10 p-2 hover:bg-white/20"
                aria-label="MEGBA on LinkedIn"
                rel="noopener noreferrer"
              >
                <Linkedin className="h-4 w-4" aria-hidden />
              </a>
              <a
                href={org.social.youtube}
                className="rounded-full bg-white/10 p-2 hover:bg-white/20"
                aria-label="MEGBA on YouTube"
                rel="noopener noreferrer"
              >
                <Youtube className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {footerNav.map((col) => (
              <div key={col.heading}>
                <p className="text-xs font-semibold uppercase tracking-eyebrow text-primary-foreground/60">
                  {col.heading}
                </p>
                <ul className="mt-3 space-y-2">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-primary-foreground/80 hover:text-primary-foreground hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-lg border border-white/10 bg-white/5 p-4 text-xs text-primary-foreground/70">
          {careDisclaimer}
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-primary-foreground/60 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {org.legalName}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalNav.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-primary-foreground hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
