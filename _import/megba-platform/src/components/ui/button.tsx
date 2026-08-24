import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "accent";
type Size = "sm" | "md" | "lg";

// Rectangular, modest rounding; calm colour transition on hover, no press-scale.
const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-forest text-primary-foreground hover:bg-forest-700",
  secondary: "bg-sage-100 text-forest-900 hover:bg-sage-300",
  outline: "border border-forest/30 text-forest hover:bg-forest/5",
  ghost: "text-forest hover:bg-forest/5",
  accent: "bg-ember-600 text-accent-foreground hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  loading?: boolean;
  children: React.ReactNode;
};

type ButtonAsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className, loading = false, children } = props;
  const classes = cn(base, variants[variant], sizes[size], className);
  const inner = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </>
  );

  if ("href" in props && props.href !== undefined) {
    const {
      href,
      variant: _v,
      size: _s,
      className: _c,
      loading: _l,
      children: _ch,
      ...rest
    } = props;
    const external = /^https?:\/\//.test(href);
    if (external) {
      return (
        <a href={href} className={classes} rel="noopener noreferrer" {...rest}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} aria-busy={loading || undefined} {...rest}>
        {inner}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    className: _c,
    loading: _l,
    children: _ch,
    disabled,
    ...rest
  } = props as ButtonAsButton;
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {inner}
    </button>
  );
}
