/** Consistent, honest placeholder for hub sections still being built. */
export function HubSectionPlaceholder({
  title,
  blurb,
  phase,
}: {
  title: string;
  blurb: string;
  phase?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Coming in the next update</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{blurb}</p>
        {phase ? <p className="mt-3 text-xs text-muted-foreground">{phase}</p> : null}
      </div>
    </div>
  );
}
