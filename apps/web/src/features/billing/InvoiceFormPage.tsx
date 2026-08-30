import type {
  BillableServicePayload,
  CustomerPayload,
  InvoicePayload,
  ShipmentPayload,
  TaxRatePayload,
} from '@mizigox/shared';
import { PAYMENT_TERMS, canIssueInvoices } from '@mizigox/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { useToast } from '../../shared/ui/ToastProvider';
import { formatApiError, paymentTermsLabel } from './format';

interface LineDraft {
  key: string;
  serviceId: string;
  shipmentId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRatePercent: string;
}

function emptyLine(taxRate = ''): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    serviceId: '',
    shipmentId: '',
    description: '',
    quantity: '1',
    unitPrice: '',
    discountAmount: '0.00',
    taxRatePercent: taxRate,
  };
}

export function InvoiceFormPage({ basePath }: { basePath: '/admin' }) {
  const { invoiceId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();
  const canIssue = canIssueInvoices(user?.permissions);
  const [customers, setCustomers] = useState<CustomerPayload[]>([]);
  const [services, setServices] = useState<BillableServicePayload[]>([]);
  const [shipments, setShipments] = useState<ShipmentPayload[]>([]);
  const [taxes, setTaxes] = useState<TaxRatePayload[]>([]);
  const [customerId, setCustomerId] = useState(search.get('customerId') ?? '');
  const [paymentTerms, setPaymentTerms] = useState<(typeof PAYMENT_TERMS)[number]>('NET_30');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [shipmentIds, setShipmentIds] = useState<string[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [loading, setLoading] = useState(Boolean(invoiceId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<CustomerPayload[]>('/customers?pageSize=100')
      .then(setCustomers)
      .catch(() => undefined);
    apiGet<BillableServicePayload[]>('/billing/services')
      .then(setServices)
      .catch(() => undefined);
    apiGet<TaxRatePayload[]>('/billing/taxes')
      .then((rates) => {
        setTaxes(rates);
        const rwandaVat = rates.find((tax) => tax.active && tax.countryCode === 'RW');
        if (rwandaVat && !invoiceId) {
          setLines([emptyLine(rwandaVat.ratePercent)]);
        }
      })
      .catch(() => undefined);
  }, [invoiceId]);

  useEffect(() => {
    if (!customerId) {
      setShipments([]);
      return;
    }
    apiGet<ShipmentPayload[]>(`/shipments?customerId=${customerId}&pageSize=100`)
      .then(setShipments)
      .catch(() => setShipments([]));
  }, [customerId]);

  useEffect(() => {
    if (!invoiceId) {
      return;
    }
    apiGet<InvoicePayload>(`/invoices/${invoiceId}`)
      .then((invoice) => {
        if (invoice.status !== 'DRAFT') {
          setError('Only draft invoices can be edited');
          return;
        }
        setCustomerId(invoice.customerOrganizationId);
        setPaymentTerms(invoice.paymentTerms);
        setIssueDate(invoice.issueDate ?? '');
        setDueDate(invoice.dueDate ?? '');
        setNotes(invoice.notes ?? '');
        setBillingAddress(invoice.billingAddress ?? '');
        setShipmentIds(invoice.shipments.map((shipment) => shipment.shipmentId));
        setLines(
          invoice.items.length > 0
            ? invoice.items.map((item) => ({
                key: item.id,
                serviceId: item.serviceId ?? '',
                shipmentId: item.shipmentId ?? '',
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount,
                taxRatePercent: item.taxRatePercent,
              }))
            : [emptyLine()],
        );
      })
      .catch((cause) => setError(formatApiError(cause, 'Unable to load invoice')))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function applyService(line: LineDraft, serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    updateLine(line.key, {
      serviceId,
      description: line.description || service?.name || '',
      unitPrice: line.unitPrice || service?.defaultPrice || '',
      taxRatePercent: line.taxRatePercent || service?.taxRatePercent || '',
    });
  }

  async function submit(issue: boolean) {
    setSaving(true);
    setError(null);
    const items = lines
      .filter((line) => line.quantity && (line.unitPrice || line.serviceId))
      .map((line) => ({
        serviceId: line.serviceId || undefined,
        shipmentId: line.shipmentId || undefined,
        description: line.description || undefined,
        quantity: line.quantity,
        unitPrice: line.unitPrice || undefined,
        discountAmount: line.discountAmount || undefined,
        taxRatePercent: line.taxRatePercent || undefined,
      }));
    try {
      if (invoiceId) {
        await apiPatch<InvoicePayload>(`/invoices/${invoiceId}`, {
          paymentTerms,
          issueDate: issueDate || undefined,
          dueDate: dueDate || undefined,
          notes,
          billingAddress,
          shipmentIds,
        });
        const current = await apiGet<InvoicePayload>(`/invoices/${invoiceId}`);
        for (const item of current.items) {
          await apiDelete(`/invoices/${invoiceId}/items/${item.id}`);
        }
        for (const item of items) {
          await apiPost(`/invoices/${invoiceId}/items`, item);
        }
        const saved = issue
          ? await apiPost<InvoicePayload>(`/invoices/${invoiceId}/issue`)
          : await apiGet<InvoicePayload>(`/invoices/${invoiceId}`);
        notify(issue ? `${saved.number} issued.` : `${saved.number} saved as draft.`);
        navigate(`${basePath}/invoices/${saved.id}`);
        return;
      }
      const created = await apiPost<InvoicePayload>('/invoices', {
        customerOrganizationId: customerId,
        paymentTerms,
        issueDate: issueDate || undefined,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        billingAddress: billingAddress || undefined,
        shipmentIds,
        items,
        issue,
      });
      notify(issue ? `${created.number} issued.` : `${created.number} saved as draft.`);
      navigate(`${basePath}/invoices/${created.id}`);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to save invoice'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading invoice…</p>;
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to={`${basePath}/invoices`}>
          Back to invoices
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-[#12355b]">
          {invoiceId ? 'Edit draft invoice' : 'Create invoice'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Totals, tax, and invoice numbers are calculated by the server. This form does not send
          client totals.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Customer</span>
          <select
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            disabled={Boolean(invoiceId)}
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Payment terms</span>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={paymentTerms}
            onChange={(event) =>
              setPaymentTerms(event.target.value as (typeof PAYMENT_TERMS)[number])
            }
          >
            {PAYMENT_TERMS.map((term) => (
              <option key={term} value={term}>
                {paymentTermsLabel(term)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Issue date</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Due date</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Billing address</span>
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            rows={2}
            value={billingAddress}
            onChange={(event) => setBillingAddress(event.target.value)}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Notes</span>
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Related shipments</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {shipments.length === 0 ? (
            <p className="text-sm text-slate-500">Select a customer to attach shipments.</p>
          ) : (
            shipments.map((shipment) => (
              <label key={shipment.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shipmentIds.includes(shipment.id)}
                  onChange={(event) => {
                    setShipmentIds((current) =>
                      event.target.checked
                        ? [...current, shipment.id]
                        : current.filter((id) => id !== shipment.id),
                    );
                  }}
                />
                {shipment.reference} · {shipment.status}
              </label>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#12355b]">Line items</h2>
          <button
            className="text-sm text-teal-800 hover:underline"
            type="button"
            onClick={() =>
              setLines((current) => [
                ...current,
                emptyLine(taxes.find((tax) => tax.active)?.ratePercent ?? ''),
              ])
            }
          >
            Add item
          </button>
        </div>
        {lines.map((line) => (
          <div
            key={line.key}
            className="grid gap-2 rounded-lg border border-slate-100 p-3 md:grid-cols-6"
          >
            <select
              className="rounded-md border border-slate-300 px-2 py-2 text-sm md:col-span-2"
              value={line.serviceId}
              onChange={(event) => applyService(line, event.target.value)}
            >
              <option value="">Service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.code} · {service.name}
                </option>
              ))}
            </select>
            <input
              className="rounded-md border border-slate-300 px-2 py-2 text-sm md:col-span-2"
              placeholder="Description"
              value={line.description}
              onChange={(event) => updateLine(line.key, { description: event.target.value })}
            />
            <select
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              value={line.shipmentId}
              onChange={(event) => updateLine(line.key, { shipmentId: event.target.value })}
            >
              <option value="">Shipment</option>
              {shipments.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.reference}
                </option>
              ))}
            </select>
            <input
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              placeholder="Qty"
              value={line.quantity}
              onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
            />
            <input
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              placeholder="Unit price"
              value={line.unitPrice}
              onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
            />
            <input
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              placeholder="Discount"
              value={line.discountAmount}
              onChange={(event) => updateLine(line.key, { discountAmount: event.target.value })}
            />
            <input
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              placeholder="Tax %"
              value={line.taxRatePercent}
              onChange={(event) => updateLine(line.key, { taxRatePercent: event.target.value })}
            />
            <button
              className="text-left text-sm text-red-700"
              type="button"
              onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm"
          disabled={saving}
          type="submit"
        >
          Save draft
        </button>
        {canIssue ? (
          <button
            className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white"
            disabled={saving}
            type="button"
            onClick={() => void submit(true)}
          >
            Issue invoice
          </button>
        ) : null}
      </div>
    </form>
  );
}
