import { Skeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return (
    <div className="min-h-dvh bg-muted/40">
      <div className="flex">
        <div className="hidden h-dvh w-64 shrink-0 border-r border-border bg-card p-4 lg:block">
          <Skeleton className="mb-6 h-8 w-40" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-9 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6 lg:p-8">
          <Skeleton className="h-8 w-64" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-80 w-full lg:col-span-2" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
