import type { InvoicePayload, PaymentPayload } from '@mizigox/shared';
import { PAYMENT_METHODS, paymentMethodLabel } from '@mizigox/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../shared/api/client';
import { useToast } from '../../shared/ui/ToastProvider';
import { formatApiError, formatMoney } from './format';

export function PaymentFormPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [invoiceId, setInvoiceId] = useState(search.get('invoiceId') ?? '');
  const [invoice, setInvoice] = useState<InvoicePayload | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [providerReference, setProviderReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
      setInvoice(null);
      return;
    }
    apiGet<InvoicePayload>(`/invoices/${invoiceId}`)
      .then((loaded) => {
        setInvoice(loaded);
        setAmount(loaded.amountDue);
      })
      .catch((cause) => setError(formatApiError(cause, 'Unable to load invoice')));
  }, [invoiceId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await apiPost<PaymentPayload>('/payments', {
        invoiceId,
        amount,
        method,
        providerReference: providerReference || undefined,
        notes: notes || undefined,
        idempotencyKey: `ui-${invoiceId}-${amount}-${Date.now()}`,
      });
      notify(`${created.reference} recorded as ${created.status.toLowerCase()}. Confirm it to apply the balance.`);
      navigate(`/admin/payments/${created.id}`);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to record payment'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void submit(event)}>
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/payments">
          Back to payments
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-[#12355b]">Record payment</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Offline cash, bank transfer, and mobile-money payments start as pending. Confirmation is a
          separate authorized step.
        </p>
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Invoice ID</span>
          <input
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={invoiceId}
            onChange={(event) => setInvoiceId(event.target.value.trim())}
          />
        </label>
        {invoice ? (
          <p className="md:col-span-2 text-sm text-slate-600">
            {invoice.number} · {invoice.customerName} · due{' '}
            {formatMoney(invoice.amountDue, invoice.currencyCode)}
          </p>
        ) : null}
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Amount</span>
          <input
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Method</span>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={method}
            onChange={(event) => setMethod(event.target.value as (typeof PAYMENT_METHODS)[number])}
          >
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {paymentMethodLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">
            Transaction reference
            {method === 'BANK_TRANSFER' || method === 'MOBILE_MONEY' ? ' (required)' : ''}
          </span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            required={method === 'BANK_TRANSFER' || method === 'MOBILE_MONEY'}
            value={providerReference}
            onChange={(event) => setProviderReference(event.target.value)}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Notes</span>
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </section>

      <button
        className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={saving}
        type="submit"
      >
        Record pending payment
      </button>
    </form>
  );
}
