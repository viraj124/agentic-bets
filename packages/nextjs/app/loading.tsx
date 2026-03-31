export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-pg-violet/30 border-t-pg-violet rounded-full animate-spin" />
        <span className="text-xs text-pg-muted font-medium">Loading…</span>
      </div>
    </div>
  );
}
