import type { InvoicePayload } from '@mizigox/shared';
import {
  canCancelInvoices,
  canCreatePayments,
  canIssueInvoices,
  canUpdateInvoices,
  invoiceStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { formatApiError, formatDateOnly, formatDateTime, formatMoney, paymentTermsLabel } from './format';

interface ActivityRow {
  action: string;
  entityType: string;
  actorName: string | null;
  createdAt: string;
}

export function InvoiceDetailPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const { invoiceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [invoice, setInvoice] = useState<InvoicePayload | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'issue' | 'cancel' | 'void' | null>(null);
  const isAdmin = basePath === '/admin';

  async function load() {
    if (!invoiceId) {
      setError('Invoice not found');
      return;
    }
    try {
      const [loaded, events] = await Promise.all([
        apiGet<InvoicePayload>(`/invoices/${invoiceId}`),
        apiGet<ActivityRow[]>(`/invoices/${invoiceId}/activity`).catch(() => []),
      ]);
      setInvoice(loaded);
      setActivity(events);
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load invoice'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function runAction() {
    if (!invoice || !confirm) {
      return;
    }
    try {
      if (confirm === 'issue') {
        setInvoice(await apiPost<InvoicePayload>(`/invoices/${invoice.id}/issue`));
        notify(`${invoice.number} issued.`);
      } else if (confirm === 'cancel') {
        setInvoice(await apiPost<InvoicePayload>(`/invoices/${invoice.id}/cancel`, {}));
        notify(`${invoice.number} cancelled.`);
      } else {
        setInvoice(await apiPost<InvoicePayload>(`/invoices/${invoice.id}/void`, {}));
        notify(`${invoice.number} voided.`);
      }
      await load();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to update invoice'), 'error');
    } finally {
      setConfirm(null);
    }
  }

  if (error || !invoice) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? 'Loading invoice…'}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link className="text-sm text-teal-800 hover:underline" to={`${basePath}/invoices`}>
            Back to invoices
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-[#12355b]">{invoice.number}</h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {invoice.customerName} · {invoice.organizationName} · {invoice.currencyCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            to={`${basePath}/invoices/${invoice.id}/print`}
          >
            Print / document
          </Link>
          {isAdmin && canUpdateInvoices(user?.permissions) && invoice.status === 'DRAFT' ? (
            <Link
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              to={`${basePath}/invoices/${invoice.id}/edit`}
            >
              Edit draft
            </Link>
          ) : null}
          {isAdmin && canIssueInvoices(user?.permissions) && invoice.status === 'DRAFT' ? (
            <button
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white"
              type="button"
              onClick={() => setConfirm('issue')}
            >
              Issue
            </button>
          ) : null}
          {isAdmin && canCreatePayments(user?.permissions) && invoice.amountDue !== '0.00' ? (
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              type="button"
              onClick={() => navigate(`/admin/payments/new?invoiceId=${invoice.id}`)}
            >
              Record payment
            </button>
          ) : null}
          {isAdmin && canCancelInvoices(user?.permissions) ? (
            <>
              <button
                className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700"
                type="button"
                onClick={() => setConfirm('cancel')}
              >
                Cancel
              </button>
              <button
                className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700"
                type="button"
                onClick={() => setConfirm('void')}
              >
                Void
              </button>
            </>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Issue date</p>
          <p className="mt-1 text-sm">{formatDateOnly(invoice.issueDate)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Due date</p>
          <p className="mt-1 text-sm">{formatDateOnly(invoice.dueDate)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Payment terms</p>
          <p className="mt-1 text-sm">{paymentTermsLabel(invoice.paymentTerms)}</p>
        </div>
        <div className="md:col-span-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Billing address</p>
          <p className="mt-1 text-sm">{invoice.billingAddress ?? '—'}</p>
        </div>
        {invoice.notes ? (
          <div className="md:col-span-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
            <p className="mt-1 text-sm">{invoice.notes}</p>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Tax</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p>{item.description}</p>
                  <p className="text-xs text-slate-500">
                    {item.serviceCode ?? 'Custom'}
                    {item.shipmentReference ? ` · ${item.shipmentReference}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {item.quantity} {item.unit}
                </td>
                <td className="px-4 py-3">{formatMoney(item.unitPrice, invoice.currencyCode)}</td>
                <td className="px-4 py-3">
                  {formatMoney(item.discountAmount, invoice.currencyCode)}
                </td>
                <td className="px-4 py-3">
                  {item.taxRatePercent}% · {formatMoney(item.taxAmount, invoice.currencyCode)}
                </td>
                <td className="px-4 py-3">{formatMoney(item.lineTotal, invoice.currencyCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:max-w-md md:ml-auto">
        <Row label="Subtotal" value={formatMoney(invoice.subtotal, invoice.currencyCode)} />
        <Row label="Discount" value={formatMoney(invoice.discountAmount, invoice.currencyCode)} />
        <Row label="Tax" value={formatMoney(invoice.taxAmount, invoice.currencyCode)} />
        <Row label="Total" value={formatMoney(invoice.totalAmount, invoice.currencyCode)} strong />
        <Row label="Paid" value={formatMoney(invoice.amountPaid, invoice.currencyCode)} />
        <Row label="Balance due" value={formatMoney(invoice.amountDue, invoice.currencyCode)} strong />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Related shipments</h2>
        {invoice.shipments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No shipments linked to this invoice.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {invoice.shipments.map((shipment) => (
              <li key={shipment.shipmentId}>
                <Link className="text-teal-800 hover:underline" to={`${basePath}/shipments/${shipment.shipmentId}`}>
                  {shipment.reference}
                </Link>{' '}
                · {invoiceStatusLabel(shipment.status)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Payment history</h2>
        {invoice.payments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No payments recorded.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {invoice.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {isAdmin ? (
                    <Link className="text-teal-800 hover:underline" to={`/admin/payments/${payment.id}`}>
                      {payment.reference}
                    </Link>
                  ) : (
                    payment.reference
                  )}{' '}
                  · {paymentMethodLabel(payment.method)} · {formatMoney(payment.amount, payment.currencyCode)}
                </span>
                <StatusBadge status={payment.status} />
                <span className="sr-only">{paymentStatusLabel(payment.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Activity</h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No financial activity recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {activity.map((event) => (
              <li key={`${event.action}-${event.createdAt}`}>
                <span className="font-medium">{event.action.replaceAll('_', ' ')}</span>
                {event.actorName ? ` · ${event.actorName}` : ''} · {formatDateTime(event.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirm ? (
        <ConfirmDialog
          title={
            confirm === 'issue'
              ? 'Issue invoice'
              : confirm === 'void'
                ? 'Void invoice'
                : 'Cancel invoice'
          }
          message={
            confirm === 'issue'
              ? 'Issuing makes this invoice an outstanding receivable. Totals cannot be edited afterwards.'
              : 'Cancelled and void invoices are not treated as outstanding receivables.'
          }
          confirmLabel={confirm === 'issue' ? 'Issue' : confirm === 'void' ? 'Void' : 'Cancel invoice'}
          danger={confirm !== 'issue'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runAction()}
        />
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-semibold text-[#12355b]' : ''}>{value}</span>
    </div>
  );
}
