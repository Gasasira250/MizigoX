import type { MapPoint } from './types';

export function ShipmentMarkerCard({ point, selected }: { point: MapPoint; selected: boolean }) {
  return (
    <div
      className={`rounded-full border px-2 py-1 text-[11px] font-medium shadow-sm ${
        selected ? 'border-[#12355b] bg-[#12355b] text-white' : 'border-amber-700 bg-amber-50 text-amber-900'
      }`}
    >
      {point.label}
    </div>
  );
}
