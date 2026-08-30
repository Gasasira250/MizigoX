import {
  routeNotificationType,
  shipmentNotificationType,
  type InvoicePayload,
  type PaymentPayload,
  type RoutePayload,
  type ShipmentPayload,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import { getEnv, publicAppUrl } from '../../config/env.js';
import { emitNotification } from './notify.js';

export async function notifyShipmentEvent(
  pool: Pool,
  shipment: ShipmentPayload,
  actorUserId?: string,
) {
  const type = shipmentNotificationType(shipment.status);
  if (!type) {
    return;
  }
  await emitNotification(pool, {
    type,
    organizationId: shipment.operatorOrganizationId,
    operatorOrganizationId: shipment.operatorOrganizationId,
    customerOrganizationId: shipment.customerOrganizationId,
    relatedEntityType: 'shipment',
    relatedEntityId: shipment.id,
    relatedReference: shipment.reference,
    actorUserId,
    variables: {
      shipment_reference: shipment.reference,
      shipment_status: shipment.status.replaceAll('_', ' '),
      customer_name: shipment.customerName,
      estimated_delivery: shipment.estimatedDeliveryAt?.slice(0, 10) ?? '',
      organization_name: shipment.operatorName,
    },
  });
}

export async function notifyRouteEvent(
  pool: Pool,
  route: RoutePayload,
  typeOverride?:
    ReturnType<typeof routeNotificationType> | 'ROUTE_DRIVER_ASSIGNED' | 'ROUTE_VEHICLE_ASSIGNED',
  actorUserId?: string,
) {
  const type = typeOverride ?? routeNotificationType(route.status);
  if (!type) {
    return;
  }
  const customer = await pool.query<{ customer_organization_id: string }>(
    `
      SELECT s.customer_organization_id
      FROM route_shipments rs
      JOIN shipments s ON s.id = rs.shipment_id
      WHERE rs.route_id = $1
      LIMIT 1
    `,
    [route.id],
  );
  await emitNotification(pool, {
    type,
    organizationId: route.organizationId,
    operatorOrganizationId: route.organizationId,
    customerOrganizationId: customer.rows[0]?.customer_organization_id,
    driverId: route.driverId ?? undefined,
    relatedEntityType: 'route',
    relatedEntityId: route.id,
    relatedReference: route.reference,
    actorUserId,
    variables: {
      route_reference: route.reference,
      driver_name: route.driverName ?? '',
      vehicle_registration: route.vehicleRegistration ?? '',
      organization_name: route.organizationName,
    },
  });
}

export async function notifyInvoiceEvent(
  pool: Pool,
  invoice: InvoicePayload,
  type:
    'INVOICE_CREATED' | 'INVOICE_ISSUED' | 'INVOICE_OVERDUE' | 'INVOICE_PAID' | 'INVOICE_DUE_SOON',
  actorUserId?: string,
) {
  await emitNotification(pool, {
    type,
    organizationId: invoice.organizationId,
    operatorOrganizationId: invoice.organizationId,
    customerOrganizationId: invoice.customerOrganizationId,
    relatedEntityType: 'invoice',
    relatedEntityId: invoice.id,
    relatedReference: invoice.number,
    actorUserId,
    variables: {
      invoice_number: invoice.number,
      customer_name: invoice.customerName,
      amount: invoice.totalAmount,
      currency: invoice.currencyCode,
      due_date: invoice.dueDate ?? '',
      organization_name: invoice.organizationName,
    },
  });
}

export async function notifyPaymentEvent(
  pool: Pool,
  payment: PaymentPayload,
  type: 'PAYMENT_RECEIVED' | 'PAYMENT_FAILED',
  actorUserId?: string,
) {
  await emitNotification(pool, {
    type,
    organizationId: payment.organizationId,
    operatorOrganizationId: payment.organizationId,
    customerOrganizationId: payment.customerOrganizationId,
    relatedEntityType: 'payment',
    relatedEntityId: payment.id,
    relatedReference: payment.reference,
    actorUserId,
    variables: {
      payment_reference: payment.reference,
      invoice_number: payment.invoiceNumber,
      customer_name: payment.customerName,
      amount: payment.amount,
      currency: payment.currencyCode,
    },
  });
}

export async function notifyInvitation(
  pool: Pool,
  input: {
    organizationId: string;
    organizationName: string;
    email: string;
    inviteId: string;
    token: string;
  },
) {
  const env = getEnv();
  await emitNotification(pool, {
    type: 'INVITATION_RECEIVED',
    organizationId: input.organizationId,
    relatedEntityType: 'user_invite',
    relatedEntityId: input.inviteId,
    relatedReference: input.email,
    recipientEmail: input.email,
    channels: ['EMAIL'],
    variables: {
      organization_name: input.organizationName,
      invite_url: `${publicAppUrl(env)}/register?token=${input.token}`,
    },
  });
}

export async function notifyAccountCreated(
  pool: Pool,
  input: { userId: string; organizationId: string; organizationName: string },
) {
  await emitNotification(pool, {
    type: 'ACCOUNT_CREATED',
    organizationId: input.organizationId,
    recipientUserId: input.userId,
    relatedEntityType: 'user',
    relatedEntityId: input.userId,
    variables: { organization_name: input.organizationName, recipient_name: '' },
  });
}

export async function notifyPasswordChanged(
  pool: Pool,
  input: { userId: string; organizationId: string },
) {
  await emitNotification(pool, {
    type: 'PASSWORD_CHANGED',
    organizationId: input.organizationId,
    recipientUserId: input.userId,
    relatedEntityType: 'user',
    relatedEntityId: input.userId,
  });
}
