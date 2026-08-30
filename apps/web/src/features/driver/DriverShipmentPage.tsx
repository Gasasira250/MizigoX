import type { ProofOfDeliveryPayload, ShipmentPayload } from '@mizigox/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function DriverShipmentPage() {
  const { shipmentId } = useParams();
  const { notify } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shipment, setShipment] = useState<ShipmentPayload | null>(null);
  const [pod, setPod] = useState<ProofOfDeliveryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  async function load() {
    if (!shipmentId || !UUID_PATTERN.test(shipmentId)) {
      setError('Shipment not found');
      return;
    }
    try {
      const next = await apiGet<ShipmentPayload>(`/shipments/${shipmentId}`);
      setShipment(next);
      setError(null);
      const existing = await apiGet<ProofOfDeliveryPayload>(`/pod/shipments/${shipmentId}`).catch(
        () => null,
      );
      setPod(existing);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load shipment'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    const pos = point(event);
    if (!ctx || !pos) return;
    setDrawing(true);
    setHasSignature(true);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function moveDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const pos = point(event);
    if (!ctx || !pos) return;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  async function submitPod() {
    if (!shipment) return;
    setBusy(true);
    try {
      const signature = hasSignature ? canvasRef.current?.toDataURL('image/png') : undefined;
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (navigator.geolocation) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 15_000,
          });
        }).catch(() => null);
        if (position) {
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        }
      }
      const created = await apiPost<ProofOfDeliveryPayload>('/pod', {
        shipmentId: shipment.id,
        recipientName,
        recipientPhone: recipientPhone || undefined,
        notes: notes || undefined,
        signatureDataUrl: signature && signature.length > 100 ? signature : undefined,
        latitude,
        longitude,
        capturedAt: new Date().toISOString(),
      });
      setPod(created);
      await load();
      notify('Proof of delivery submitted');
    } catch (cause) {
      notify(formatAppError(cause, 'Unable to submit proof of delivery'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (error && !shipment) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!shipment) {
    return <LoadingState />;
  }

  const deliverable = ['PICKED_UP', 'IN_TRANSIT', 'AT_DESTINATION', 'OUT_FOR_DELIVERY'].includes(
    shipment.status,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={shipment.reference}
        description={shipment.customerName}
        actions={<StatusBadge status={shipment.status} />}
      />
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p>
          Pickup:{' '}
          {shipment.origin?.formattedAddress ?? shipment.pickup.address?.formattedAddress ?? '—'}
        </p>
        <p className="mt-1">
          Delivery:{' '}
          {shipment.destination?.formattedAddress ??
            shipment.delivery.address?.formattedAddress ??
            '—'}
        </p>
        <p className="mt-2">{shipment.cargoDescription}</p>
        {shipment.specialInstructions ? (
          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2">{shipment.specialInstructions}</p>
        ) : null}
        {shipment.currentRoute ? (
          <Link
            className="mt-3 inline-block text-[#12355b] hover:underline"
            to={`/driver/trips/${shipment.currentRoute.id}`}
          >
            Open route {shipment.currentRoute.reference}
          </Link>
        ) : null}
      </section>

      {pod ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-[#12355b]">Proof of delivery</h2>
          <p className="mt-2 text-sm">Recipient {pod.recipientName}</p>
          <StatusBadge status={pod.status} />
        </section>
      ) : deliverable ? (
        <form
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitPod();
          }}
        >
          <h2 className="text-sm font-semibold text-[#12355b]">Confirm delivery</h2>
          <label className="block text-sm font-medium">
            Recipient name
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Recipient phone
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={recipientPhone}
              onChange={(event) => setRecipientPhone(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Delivery notes
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <div>
            <p className="text-sm font-medium">Signature</p>
            <canvas
              ref={canvasRef}
              width={360}
              height={140}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white touch-none"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={() => setDrawing(false)}
              onPointerLeave={() => setDrawing(false)}
            />
          </div>
          <p className="text-xs text-slate-500">
            Location is captured from this device when permission is granted. Coordinates are never
            invented.
          </p>
          <button
            type="submit"
            className="min-h-11 w-full rounded-md bg-[#12355b] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
          >
            {busy ? 'Submitting…' : 'Submit proof of delivery'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-500">
          This shipment is not ready for delivery confirmation.
        </p>
      )}
    </div>
  );
}
