import type { CustomerPayload } from '@mizigox/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiGet, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';

export function ShipmentFormPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStaff = user?.organization.type !== 'CUSTOMER';
  const [customers, setCustomers] = useState<CustomerPayload[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [cargo, setCargo] = useState('');
  const [weight, setWeight] = useState('');
  const [pieces, setPieces] = useState('');
  const [pickup, setPickup] = useState('');
  const [delivery, setDelivery] = useState('');
  const [originStreet, setOriginStreet] = useState('');
  const [originDistrict, setOriginDistrict] = useState('');
  const [destinationStreet, setDestinationStreet] = useState('');
  const [destinationDistrict, setDestinationDistrict] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isStaff) {
      return;
    }
    apiGet<CustomerPayload[]>('/customers')
      .then((rows) => {
        setCustomers(rows);
        setCustomerId(rows[0]?.id ?? '');
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Unable to load customers'));
  }, [isStaff]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const shipment = await apiPost<{ id: string }>('/shipments', {
        customerOrganizationId: isStaff ? customerId : undefined,
        cargoDescription: cargo,
        weightKg: weight ? Number(weight) : undefined,
        piecesCount: pieces ? Number(pieces) : undefined,
        estimatedPickupAt: pickup || undefined,
        estimatedDeliveryAt: delivery || undefined,
        origin: { countryCode: 'RW', streetLine1: originStreet, adminArea2: originDistrict || undefined },
        destination: {
          countryCode: 'RW',
          streetLine1: destinationStreet,
          adminArea2: destinationDistrict || undefined,
        },
      });
      navigate(`${basePath}/shipments/${shipment.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to create shipment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to={`${basePath}/shipments`}>
          Back to shipments
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[#12355b]">Create shipment</h1>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
        {isStaff ? (
          <label className="text-sm font-medium md:col-span-2">
            Customer
            <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm font-medium md:col-span-2">
          Cargo description
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={cargo} onChange={(e) => setCargo(e.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Weight (kg)
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="number" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Pieces
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="number" min="1" value={pieces} onChange={(e) => setPieces(e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Estimated pickup
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Estimated delivery
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="datetime-local" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Origin street
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={originStreet} onChange={(e) => setOriginStreet(e.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Origin district
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={originDistrict} onChange={(e) => setOriginDistrict(e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Destination street
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={destinationStreet} onChange={(e) => setDestinationStreet(e.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Destination district
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={destinationDistrict} onChange={(e) => setDestinationDistrict(e.target.value)} />
        </label>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">{error}</p> : null}
        <div className="md:col-span-2">
          <button className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white" disabled={submitting} type="submit">
            {submitting ? 'Booking…' : 'Book shipment'}
          </button>
        </div>
      </form>
    </div>
  );
}
