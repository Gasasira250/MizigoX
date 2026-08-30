import { useParams } from 'react-router-dom';
import { ShipmentTrackingPanel } from './ShipmentTrackingPanel';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ShipmentTrackingPage() {
  const { shipmentId } = useParams();
  if (!shipmentId || !UUID_PATTERN.test(shipmentId)) {
    return <p className="text-sm text-red-700">Shipment not found</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Shipment tracking</p>
        <h1 className="text-2xl font-semibold text-[#12355b]">Shipment tracking</h1>
      </div>
      <ShipmentTrackingPanel shipmentId={shipmentId} basePath="/admin" />
    </div>
  );
}
