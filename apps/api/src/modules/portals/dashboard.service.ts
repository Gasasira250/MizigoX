import type {
  CustomerDashboardPayload,
  FinanceDashboardPayload,
  OperationsDashboardPayload,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import { getEnv } from '../../config/env.js';
import { forbidden } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { getFinanceSummary, listInvoices, listPayments } from '../billing/billing.service.js';
import { listInvoicesQuerySchema, listPaymentsQuerySchema } from '../billing/billing.schemas.js';
import { getCustomer } from '../customers/customer.service.js';

const ACTIVE_SHIPMENT_STATUSES = [
  'CONFIRMED',
  'ASSIGNED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_DESTINATION',
  'OUT_FOR_DELIVERY',
];
const PENDING_SHIPMENT_STATUSES = ['DRAFT', 'PENDING', 'CONFIRMED'];
const AWAITING_PICKUP = ['ASSIGNED', 'READY_FOR_PICKUP'];
const IN_TRANSIT = ['PICKED_UP', 'IN_TRANSIT', 'AT_DESTINATION'];
const ACTIVE_ROUTE_STATUSES = ['DISPATCHED', 'IN_TRANSIT', 'ARRIVED'];
const AWAITING_DISPATCH = ['PLANNED', 'READY'];

export async function getOperationsDashboard(
  pool: Pool,
  actor: AuthContext,
): Promise<OperationsDashboardPayload> {
  if (actor.orgType === 'CUSTOMER' || actor.role === 'DRIVER') {
    throw forbidden('You do not have access to the operations dashboard');
  }

  const shipmentWhere = ['s.deleted_at IS NULL'];
  const shipmentParams: unknown[] = [];
  applyOperatorScope(actor, shipmentWhere, shipmentParams, 's.operator_organization_id');

  const countParams = [...shipmentParams];
  const activePh = push(countParams, ACTIVE_SHIPMENT_STATUSES);
  const pickupPh = push(countParams, AWAITING_PICKUP);
  const transitPh = push(countParams, IN_TRANSIT);
  const counts = await pool.query(
    `
      SELECT
        count(*) FILTER (WHERE s.status::text = ANY(${activePh}::text[]))::int AS active,
        count(*) FILTER (WHERE s.status::text = ANY(${pickupPh}::text[]))::int AS awaiting_pickup,
        count(*) FILTER (WHERE s.status::text = ANY(${transitPh}::text[]))::int AS in_transit,
        count(*) FILTER (WHERE s.status::text = 'OUT_FOR_DELIVERY')::int AS out_for_delivery,
        count(*) FILTER (WHERE s.status::text = 'DELIVERED')::int AS delivered,
        count(*) FILTER (WHERE s.status::text = 'DELIVERY_FAILED')::int AS delivery_failed,
        count(*) FILTER (
          WHERE s.estimated_delivery_at IS NOT NULL
            AND s.estimated_delivery_at < now()
            AND s.status::text NOT IN ('DELIVERED', 'CANCELLED')
        )::int AS overdue
      FROM shipments s
      WHERE ${shipmentWhere.join(' AND ')}
    `,
    countParams,
  );

  const byStatus = await pool.query<{ status: string; count: string }>(
    `
      SELECT s.status::text AS status, count(*)::text AS count
      FROM shipments s
      WHERE ${shipmentWhere.join(' AND ')}
      GROUP BY s.status
      ORDER BY s.status
    `,
    shipmentParams,
  );

  const routeWhere = ['r.deleted_at IS NULL'];
  const routeParams: unknown[] = [];
  applyOperatorScope(actor, routeWhere, routeParams, 'r.organization_id');
  const routeCountParams = [...routeParams];
  const activeRoutePh = push(routeCountParams, ACTIVE_ROUTE_STATUSES);
  const waitPh = push(routeCountParams, AWAITING_DISPATCH);
  const routes = await pool.query(
    `
      SELECT
        count(*) FILTER (WHERE r.status::text = ANY(${activeRoutePh}::text[]))::int AS active,
        count(*) FILTER (WHERE r.status::text = ANY(${waitPh}::text[]))::int AS awaiting_dispatch
      FROM routes r
      WHERE ${routeWhere.join(' AND ')}
    `,
    routeCountParams,
  );

  const fleetWhere = ['deleted_at IS NULL'];
  const fleetParams: unknown[] = [];
  applyOperatorScope(actor, fleetWhere, fleetParams, 'organization_id');
  const vehicles = await pool.query(
    `SELECT count(*)::int AS count FROM vehicles WHERE ${fleetWhere.join(' AND ')} AND status::text = 'AVAILABLE'`,
    fleetParams,
  );
  const drivers = await pool.query(
    `SELECT count(*)::int AS count FROM drivers WHERE ${fleetWhere.join(' AND ')} AND status::text = 'AVAILABLE'`,
    fleetParams,
  );

  const liveSeconds = getEnv().TRACKING_LIVE_SECONDS;
  const staleSeconds = getEnv().TRACKING_STALE_SECONDS;
  const trackingWhere = ['TRUE'];
  const trackingParams: unknown[] = [];
  applyOperatorScope(actor, trackingWhere, trackingParams, 'cl.organization_id');
  const trackingCountParams = [...trackingParams];
  const livePh = push(trackingCountParams, liveSeconds);
  const stalePh = push(trackingCountParams, staleSeconds);
  const tracking = await pool.query(
    `
      SELECT
        count(*) FILTER (WHERE cl.last_updated_at >= now() - (${livePh}::int * interval '1 second'))::int AS live,
        count(*) FILTER (
          WHERE cl.last_updated_at < now() - (${stalePh}::int * interval '1 second')
        )::int AS stale,
        max(cl.last_updated_at) AS last_update_at
      FROM vehicle_current_locations cl
      WHERE ${trackingWhere.join(' AND ')}
    `,
    trackingCountParams,
  );

  const recentShipments = await pool.query(
    `
      SELECT s.id, s.reference, s.status::text AS status, c.name AS customer_name, s.updated_at
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      WHERE ${shipmentWhere.join(' AND ')}
      ORDER BY s.updated_at DESC
      LIMIT 8
    `,
    shipmentParams,
  );
  const recentRoutes = await pool.query(
    `
      SELECT r.id, r.reference, r.status::text AS status, r.origin_text, r.destination_text, r.updated_at
      FROM routes r
      WHERE ${routeWhere.join(' AND ')}
      ORDER BY r.updated_at DESC
      LIMIT 8
    `,
    routeParams,
  );
  const dispatchActivity = await pool.query(
    `
      SELECT e.id, e.event_type, e.description, e.occurred_at, r.id AS route_id, r.reference
      FROM route_events e
      JOIN routes r ON r.id = e.route_id
      WHERE ${routeWhere.join(' AND ')}
        AND e.event_type IN (
          'DISPATCHED', 'STATUS_CHANGED', 'COMPLETED', 'TRIP_ACCEPTED', 'STOP_ARRIVED', 'STOP_COMPLETED'
        )
      ORDER BY e.occurred_at DESC
      LIMIT 8
    `,
    routeParams,
  );

  const row = counts.rows[0] ?? {};
  const routeRow = routes.rows[0] ?? {};
  const trackingRow = tracking.rows[0] ?? {};
  const alerts: OperationsDashboardPayload['alerts'] = [];
  if (Number(row.overdue ?? 0) > 0) {
    alerts.push({
      id: 'overdue-shipments',
      severity: 'critical',
      title: 'Overdue shipments',
      detail: `${row.overdue} shipment${Number(row.overdue) === 1 ? '' : 's'} past estimated delivery.`,
      href: '/admin/shipments',
    });
  }
  if (Number(row.delivery_failed ?? 0) > 0) {
    alerts.push({
      id: 'delivery-failures',
      severity: 'warning',
      title: 'Delivery failures',
      detail: `${row.delivery_failed} shipment${Number(row.delivery_failed) === 1 ? '' : 's'} marked delivery failed.`,
      href: '/admin/shipments',
    });
  }
  if (Number(routeRow.awaiting_dispatch ?? 0) > 0) {
    alerts.push({
      id: 'awaiting-dispatch',
      severity: 'info',
      title: 'Routes awaiting dispatch',
      detail: `${routeRow.awaiting_dispatch} route${Number(routeRow.awaiting_dispatch) === 1 ? '' : 's'} ready for dispatch.`,
      href: '/admin/dispatch',
    });
  }
  if (Number(trackingRow.stale ?? 0) > 0) {
    alerts.push({
      id: 'stale-tracking',
      severity: 'warning',
      title: 'Stale vehicle locations',
      detail: `${trackingRow.stale} vehicle${Number(trackingRow.stale) === 1 ? '' : 's'} have not reported recently.`,
      href: '/admin/tracking',
    });
  }

  return {
    shipments: {
      active: Number(row.active ?? 0),
      awaitingPickup: Number(row.awaiting_pickup ?? 0),
      inTransit: Number(row.in_transit ?? 0),
      outForDelivery: Number(row.out_for_delivery ?? 0),
      delivered: Number(row.delivered ?? 0),
      deliveryFailed: Number(row.delivery_failed ?? 0),
      overdue: Number(row.overdue ?? 0),
      byStatus: byStatus.rows.map((item) => ({
        status: item.status,
        count: Number(item.count),
      })),
    },
    routes: {
      active: Number(routeRow.active ?? 0),
      awaitingDispatch: Number(routeRow.awaiting_dispatch ?? 0),
    },
    fleet: {
      availableVehicles: Number(vehicles.rows[0]?.count ?? 0),
      availableDrivers: Number(drivers.rows[0]?.count ?? 0),
    },
    tracking: {
      liveVehicles: Number(trackingRow.live ?? 0),
      staleVehicles: Number(trackingRow.stale ?? 0),
      lastUpdateAt: trackingRow.last_update_at
        ? new Date(trackingRow.last_update_at as string).toISOString()
        : null,
    },
    recentShipments: recentShipments.rows.map((item) => ({
      id: String(item.id),
      reference: String(item.reference),
      status: String(item.status),
      customerName: String(item.customer_name),
      updatedAt: new Date(item.updated_at as string).toISOString(),
    })),
    recentRoutes: recentRoutes.rows.map((item) => ({
      id: String(item.id),
      reference: String(item.reference),
      status: String(item.status),
      origin: (item.origin_text as string | null) ?? null,
      destination: (item.destination_text as string | null) ?? null,
      updatedAt: new Date(item.updated_at as string).toISOString(),
    })),
    dispatchActivity: dispatchActivity.rows.map((item) => ({
      id: String(item.id),
      title: String(item.reference),
      detail: String(item.description ?? item.event_type),
      occurredAt: new Date(item.occurred_at as string).toISOString(),
      href: `/admin/routes/${item.route_id}`,
    })),
    alerts,
  };
}

export async function getFinanceDashboard(
  pool: Pool,
  actor: AuthContext,
): Promise<FinanceDashboardPayload> {
  if (actor.orgType === 'CUSTOMER' || actor.role === 'DRIVER') {
    throw forbidden('You do not have access to the finance dashboard');
  }
  const summary = await getFinanceSummary(pool, actor);
  const [invoices, payments, statusRows] = await Promise.all([
    listInvoices(
      pool,
      actor,
      listInvoicesQuerySchema.parse({ page: '1', pageSize: '8', sort: 'createdAt', order: 'desc' }),
    ),
    listPayments(
      pool,
      actor,
      listPaymentsQuerySchema.parse({ page: '1', pageSize: '8', sort: 'createdAt', order: 'desc' }),
    ),
    paymentStatusCounts(pool, actor),
  ]);

  return {
    summary,
    paymentStatus: statusRows,
    recentInvoices: invoices.invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      customerName: invoice.customerName,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      amountDue: invoice.amountDue,
      currencyCode: invoice.currencyCode,
      dueDate: invoice.dueDate,
    })),
    recentPayments: payments.payments.map((payment) => ({
      id: payment.id,
      reference: payment.reference,
      customerName: payment.customerName,
      status: payment.status,
      amount: payment.amount,
      currencyCode: payment.currencyCode,
      paidAt: payment.paidAt,
    })),
  };
}

export async function getCustomerDashboard(
  pool: Pool,
  actor: AuthContext,
): Promise<CustomerDashboardPayload> {
  if (actor.orgType !== 'CUSTOMER') {
    throw forbidden('This dashboard is only available to customer accounts');
  }

  const counts = await pool.query(
    `
      SELECT
        count(*) FILTER (WHERE status::text = ANY($2::text[]))::int AS active,
        count(*) FILTER (WHERE status::text = ANY($3::text[]))::int AS pending,
        count(*) FILTER (WHERE status::text = 'DELIVERED')::int AS delivered
      FROM shipments
      WHERE deleted_at IS NULL AND customer_organization_id = $1
    `,
    [actor.orgId, ACTIVE_SHIPMENT_STATUSES, PENDING_SHIPMENT_STATUSES],
  );
  const recent = await pool.query(
    `
      SELECT id, reference, status::text AS status, updated_at
      FROM shipments
      WHERE deleted_at IS NULL AND customer_organization_id = $1
      ORDER BY updated_at DESC
      LIMIT 8
    `,
    [actor.orgId],
  );
  const events = await pool.query(
    `
      SELECT e.id, e.event_type, e.note, e.occurred_at, s.id AS shipment_id, s.reference
      FROM shipment_events e
      JOIN shipments s ON s.id = e.shipment_id
      WHERE s.deleted_at IS NULL AND s.customer_organization_id = $1
      ORDER BY e.occurred_at DESC
      LIMIT 8
    `,
    [actor.orgId],
  );

  let outstanding: CustomerDashboardPayload['outstandingInvoices'] = null;
  if (
    actor.permissions.includes('invoices.read') ||
    actor.permissions.includes('invoices.manage')
  ) {
    const invoices = await pool.query(
      `
        SELECT
          count(*)::int AS count,
          coalesce(sum(amount_due), 0)::text AS amount_due,
          coalesce(max(currency_code), $2) AS currency_code
        FROM invoices
        WHERE deleted_at IS NULL
          AND customer_organization_id = $1
          AND status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
      `,
      [actor.orgId, actor.currencyCode],
    );
    outstanding = {
      count: Number(invoices.rows[0]?.count ?? 0),
      amountDue: String(invoices.rows[0]?.amount_due ?? '0'),
      currencyCode: String(invoices.rows[0]?.currency_code ?? actor.currencyCode),
    };
  }

  const row = counts.rows[0] ?? {};
  return {
    shipments: {
      active: Number(row.active ?? 0),
      pending: Number(row.pending ?? 0),
      delivered: Number(row.delivered ?? 0),
    },
    outstandingInvoices: outstanding,
    recentShipments: recent.rows.map((item) => ({
      id: String(item.id),
      reference: String(item.reference),
      status: String(item.status),
      updatedAt: new Date(item.updated_at as string).toISOString(),
    })),
    recentActivity: events.rows.map((item) => ({
      id: String(item.id),
      title: String(item.reference),
      detail: String(item.note ?? item.event_type),
      occurredAt: new Date(item.occurred_at as string).toISOString(),
      href: `/portal/shipments/${item.shipment_id}`,
    })),
  };
}

export async function getCustomerProfile(pool: Pool, actor: AuthContext) {
  if (actor.orgType !== 'CUSTOMER') {
    throw forbidden('Only customer accounts can load this profile');
  }
  return getCustomer(pool, actor, actor.orgId);
}

function applyOperatorScope(
  actor: AuthContext,
  where: string[],
  params: unknown[],
  column: string,
) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  params.push(actor.orgId);
  where.push(`${column} = $${params.length}`);
}

function push(params: unknown[], value: unknown) {
  params.push(value);
  return `$${params.length}`;
}

async function paymentStatusCounts(pool: Pool, actor: AuthContext) {
  const where = ['TRUE'];
  const params: unknown[] = [];
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`p.organization_id = $${params.length}`);
  }
  const result = await pool.query<{ status: string; count: string }>(
    `
      SELECT p.status::text AS status, count(*)::text AS count
      FROM payments p
      WHERE ${where.join(' AND ')}
      GROUP BY p.status
      ORDER BY p.status
    `,
    params,
  );
  return result.rows.map((row) => ({ status: row.status, count: Number(row.count) }));
}
