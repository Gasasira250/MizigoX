import type { FinanceSummaryPayload } from '@mizigox/shared';
import { formatMoney } from './format';

export function FinanceSummaryCards({ summary }: { summary: FinanceSummaryPayload }) {
  const cards = [
    {
      label: 'Total revenue',
      value: formatMoney(summary.totalRevenue, summary.currencyCode),
      detail: 'Issued invoice totals',
    },
    {
      label: 'Amount paid',
      value: formatMoney(summary.amountPaid, summary.currencyCode),
      detail: 'Confirmed payments only',
    },
    {
      label: 'Amount due',
      value: formatMoney(summary.amountDue, summary.currencyCode),
      detail: `${summary.outstandingInvoiceCount} outstanding`,
    },
    {
      label: 'Overdue',
      value: formatMoney(summary.overdueAmount, summary.currencyCode),
      detail: `${summary.overdueInvoiceCount} overdue invoices`,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {card.label}
          </p>
          <p className="mt-2 text-lg font-semibold text-[#12355b]">{card.value}</p>
          <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
        </div>
      ))}
    </div>
  );
}
