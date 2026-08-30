import type { InvoiceDocumentPayload } from '@mizigox/shared';
import { invoiceStatusLabel, paymentMethodLabel, paymentStatusLabel } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { formatApiError, formatDateOnly, formatMoney, paymentTermsLabel } from './format';

export function InvoicePrintPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const { invoiceId } = useParams();
  const [document, setDocument] = useState<InvoiceDocumentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setError('Invoice not found');
      return;
    }
    apiGet<InvoiceDocumentPayload>(`/invoices/${invoiceId}/document`)
      .then(setDocument)
      .catch((cause) => setError(formatApiError(cause, 'Unable to load invoice document')));
  }, [invoiceId]);

  if (error || !document) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? 'Preparing invoice document…'}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link className="text-sm text-teal-800 hover:underline" to={`${basePath}/invoices/${invoiceId}`}>
          Back to invoice
        </Link>
        <button
          className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white"
          type="button"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-8 print:border-0">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">MizigoX</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#12355b]">Invoice {document.invoiceNumber}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {invoiceStatusLabel(document.status)} · {document.currencyCode}
            </p>
          </div>
          <div className="text-sm text-slate-600">
            <p>Issue date: {formatDateOnly(document.issueDate)}</p>
            <p>Due date: {formatDateOnly(document.dueDate)}</p>
            <p>Terms: {paymentTermsLabel(document.paymentTerms)}</p>
          </div>
        </header>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <Party title="From" party={document.seller} />
          <Party title="Bill to" party={document.buyer} />
        </section>

        <table className="mt-8 min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Unit price</th>
              <th className="py-2">Discount</th>
              <th className="py-2">Tax</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {document.items.map((item, index) => (
              <tr key={`${item.description}-${index}`} className="border-b border-slate-100">
                <td className="py-3">
                  {item.description}
                  {item.shipmentReference ? (
                    <span className="block text-xs text-slate-500">{item.shipmentReference}</span>
                  ) : null}
                </td>
                <td className="py-3">
                  {item.quantity} {item.unit}
                </td>
                <td className="py-3">{formatMoney(item.unitPrice, document.currencyCode)}</td>
                <td className="py-3">{formatMoney(item.discountAmount, document.currencyCode)}</td>
                <td className="py-3">
                  {item.taxRatePercent}% · {formatMoney(item.taxAmount, document.currencyCode)}
                </td>
                <td className="py-3">{formatMoney(item.lineTotal, document.currencyCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-6 ml-auto max-w-sm space-y-1 text-sm">
          <TotalRow label="Subtotal" value={formatMoney(document.totals.subtotal, document.currencyCode)} />
          <TotalRow
            label="Discount"
            value={formatMoney(document.totals.discountAmount, document.currencyCode)}
          />
          <TotalRow label="Tax" value={formatMoney(document.totals.taxAmount, document.currencyCode)} />
          <TotalRow
            label="Total"
            value={formatMoney(document.totals.totalAmount, document.currencyCode)}
            strong
          />
          <TotalRow label="Paid" value={formatMoney(document.totals.amountPaid, document.currencyCode)} />
          <TotalRow
            label="Balance due"
            value={formatMoney(document.totals.amountDue, document.currencyCode)}
            strong
          />
        </section>

        {document.payments.length > 0 ? (
          <section className="mt-8 text-sm">
            <h2 className="font-semibold text-[#12355b]">Payments</h2>
            <ul className="mt-2 space-y-1">
              {document.payments.map((payment) => (
                <li key={payment.reference}>
                  {payment.reference} · {paymentMethodLabel(payment.method)} ·{' '}
                  {paymentStatusLabel(payment.status)} · {formatMoney(payment.amount, document.currencyCode)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {document.notes ? <p className="mt-8 text-sm text-slate-600">{document.notes}</p> : null}
      </article>
    </div>
  );
}

function Party({
  title,
  party,
}: {
  title: string;
  party: InvoiceDocumentPayload['seller'];
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 font-medium text-[#12355b]">{party.name}</p>
      {party.legalName ? <p className="text-sm text-slate-600">{party.legalName}</p> : null}
      {party.taxId ? <p className="text-sm text-slate-600">Tax ID: {party.taxId}</p> : null}
      {party.address ? <p className="text-sm text-slate-600">{party.address}</p> : null}
      {party.email ? <p className="text-sm text-slate-600">{party.email}</p> : null}
      {party.phone ? <p className="text-sm text-slate-600">{party.phone}</p> : null}
    </div>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-semibold text-[#12355b]' : ''}>{value}</span>
    </div>
  );
}
