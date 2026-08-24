import * as React from "react";
import { Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "note" | "warning";

const map: Record<Tone, { icon: React.ElementType; cls: string }> = {
  info: { icon: Info, cls: "border-forest/20 bg-forest-50 text-forest-900" },
  note: { icon: ShieldCheck, cls: "border-sage-300 bg-sage-100 text-forest-900" },
  warning: { icon: TriangleAlert, cls: "border-ember/30 bg-ember/5 text-charcoal" },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, cls } = map[tone];
  return (
    <div className={cn("flex gap-3 rounded-md border p-4 text-sm", cls, className)} role="note">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-1", "leading-relaxed")}>{children}</div>
      </div>
    </div>
  );
}
