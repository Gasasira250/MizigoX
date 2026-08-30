import type { PaymentPayload } from '@mizigox/shared';
import {
  canConfirmPayments,
  canRefundPayments,
  paymentMethodLabel,
  paymentStatusLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { formatApiError, formatDateTime, formatMoney } from './format';

export function PaymentDetailPage() {
  const { paymentId } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const [payment, setPayment] = useState<PaymentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'confirm' | 'fail' | 'cancel' | 'refund' | null>(null);
  const [refundReason, setRefundReason] = useState('');

  async function load() {
    if (!paymentId) {
      setError('Payment not found');
      return;
    }
    try {
      setPayment(await apiGet<PaymentPayload>(`/payments/${paymentId}`));
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load payment'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  async function runAction() {
    if (!payment || !confirm) {
      return;
    }
    try {
      if (confirm === 'confirm') {
        setPayment(await apiPost<PaymentPayload>(`/payments/${payment.id}/confirm`, {}));
        notify('Payment confirmed and applied to the invoice.');
      } else if (confirm === 'fail') {
        setPayment(await apiPost<PaymentPayload>(`/payments/${payment.id}/fail`));
        notify('Payment marked failed.');
      } else if (confirm === 'cancel') {
        setPayment(await apiPost<PaymentPayload>(`/payments/${payment.id}/cancel`));
        notify('Payment cancelled.');
      } else {
        setPayment(
          await apiPost<PaymentPayload>(`/payments/${payment.id}/refund`, {
            reason: refundReason || 'Refund recorded by finance',
          }),
        );
        notify('Refund recorded. The original payment was not deleted.');
      }
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to update payment'), 'error');
    } finally {
      setConfirm(null);
    }
  }

  if (error || !payment) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? 'Loading payment…'}
      </p>
    );
  }

  const pending = payment.status === 'PENDING' || payment.status === 'PROCESSING';

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/payments">
          Back to payments
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-[#12355b]">{payment.reference}</h1>
          <StatusBadge status={payment.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {payment.customerName} · invoice{' '}
          <Link
            className="text-teal-800 hover:underline"
            to={`/admin/invoices/${payment.invoiceId}`}
          >
            {payment.invoiceNumber}
          </Link>
        </p>
      </div>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <Field label="Amount" value={formatMoney(payment.amount, payment.currencyCode)} />
        <Field label="Method" value={paymentMethodLabel(payment.method)} />
        <Field label="Provider" value={payment.provider} />
        <Field label="Status" value={paymentStatusLabel(payment.status)} />
        <Field label="Transaction reference" value={payment.providerReference ?? '—'} />
        <Field label="Paid at" value={formatDateTime(payment.paidAt)} />
        <Field label="Created" value={formatDateTime(payment.createdAt)} />
        <Field label="Created by" value={payment.createdByName ?? 'System'} />
        {payment.notes ? <Field label="Notes" value={payment.notes} /> : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {pending && canConfirmPayments(user?.permissions) ? (
          <button
            className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white"
            type="button"
            onClick={() => setConfirm('confirm')}
          >
            Confirm payment
          </button>
        ) : null}
        {pending ? (
          <>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              type="button"
              onClick={() => setConfirm('fail')}
            >
              Mark failed
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              type="button"
              onClick={() => setConfirm('cancel')}
            >
              Cancel
            </button>
          </>
        ) : null}
        {payment.status === 'SUCCESSFUL' && canRefundPayments(user?.permissions) ? (
          <button
            className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700"
            type="button"
            onClick={() => setConfirm('refund')}
          >
            Record refund
          </button>
        ) : null}
      </div>

      {confirm === 'refund' ? (
        <label className="block max-w-lg text-sm">
          <span className="mb-1 block font-medium text-slate-700">Refund reason</span>
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            rows={3}
            value={refundReason}
            onChange={(event) => setRefundReason(event.target.value)}
          />
        </label>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={
            confirm === 'confirm'
              ? 'Confirm payment'
              : confirm === 'refund'
                ? 'Record refund'
                : confirm === 'fail'
                  ? 'Mark payment failed'
                  : 'Cancel payment'
          }
          message={
            confirm === 'confirm'
              ? 'This applies the payment to the invoice balance. Only confirm after the funds are verified.'
              : confirm === 'refund'
                ? 'The original successful payment will remain in history and be marked refunded.'
                : 'This does not change the invoice balance because the payment was never confirmed.'
          }
          confirmLabel={confirm === 'confirm' ? 'Confirm' : 'Continue'}
          danger={confirm !== 'confirm'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runAction()}
        />
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
