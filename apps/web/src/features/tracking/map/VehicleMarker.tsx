import type { MapPoint } from './types';

export function VehicleMarkerCard({ point, selected }: { point: MapPoint; selected: boolean }) {
  return (
    <div
      className={`rounded-full border px-2 py-1 text-[11px] font-medium shadow-sm ${
        selected ? 'border-[#12355b] bg-[#12355b] text-white' : 'border-teal-700 bg-teal-50 text-teal-900'
      }`}
    >
      {point.label}
    </div>
  );
}
