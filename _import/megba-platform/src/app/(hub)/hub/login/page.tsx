import Link from "next/link";
import { redirect } from "next/navigation";
import { getHubSessionUser } from "@/lib/hub/session";
import { HubLoginForm } from "@/components/hub/login-form";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Employee Hub", path: "/hub/login", noindex: true });

export default async function HubLoginPage() {
  const user = await getHubSessionUser();
  if (user) redirect("/hub");

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-forest p-10 text-primary-foreground lg:flex">
        <Link href="/" aria-label="Mount Etna, home" className="inline-flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-megba.svg" alt="Mount Etna" className="h-11 w-auto rounded bg-white/90 px-3 py-2" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Mount Etna Employee Hub</h1>
          <p className="mt-2 text-lg text-primary-foreground/80">Learn · Grow · Connect</p>
          <p className="mt-6 max-w-sm text-primary-foreground/70">
            Welcome to the Mount Etna ecosystem. Your onboarding, training, professional
            development and certificates, all in one calm place.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">
          Mount Etna Child &amp; Family Services · Private beta
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-muted/40 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-megba.svg" alt="Mount Etna" className="h-10 w-auto" />
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Sign in to the Employee Hub</h2>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
              Use your Mount Etna email and the beta access password.
            </p>
            <HubLoginForm />
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:text-forest">
              Return to mountetna.ca
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
