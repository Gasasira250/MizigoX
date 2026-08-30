export function MapControls({
  onFit,
  onClear,
  canFit,
}: {
  onFit: () => void;
  onClear?: () => void;
  canFit: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        disabled={!canFit}
        onClick={onFit}
      >
        Fit locations
      </button>
      {onClear ? (
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={onClear}
        >
          Clear selection
        </button>
      ) : null}
    </div>
  );
}
