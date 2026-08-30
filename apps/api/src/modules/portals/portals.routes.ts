import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import {
  getCustomerDashboard,
  getCustomerProfile,
  getFinanceDashboard,
  getOperationsDashboard,
} from './dashboard.service.js';
import { getDriverDashboard } from './driver-portal.service.js';
import {
  acceptDriverTrip,
  arriveDriverStop,
  completeDriverStop,
  completeDriverTrip,
  getDriverTrip,
  listDriverTrips,
  startDriverTrip,
} from './driver-portal.service.js';
import {
  getAdminUser,
  listAdminUsers,
  listAuditLogs,
  listOrganizationUsers,
  updateAdminUserRole,
  updateAdminUserStatus,
} from './admin.service.js';
import { getProofOfDelivery, submitProofOfDelivery, verifyProofOfDelivery } from './pod.service.js';
import {
  getOrganizationSettings,
  getProfile,
  updateOrganizationSettings,
  updateProfile,
} from './profile.service.js';
import { globalSearch } from './search.service.js';
import {
  driverNoteSchema,
  listAuditQuerySchema,
  listUsersQuerySchema,
  organizationIdParamSchema,
  podIdParamSchema,
  routeIdParamSchema,
  searchQuerySchema,
  shipmentIdParamSchema,
  stopIdParamSchema,
  submitPodSchema,
  updateOrganizationSettingsSchema,
  updateProfileSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  userIdParamSchema,
  verifyPodSchema,
} from './portals.schemas.js';

export const portalRouter = Router();

portalRouter.use(authenticate);

portalRouter.get(
  '/dashboards/operations',
  requirePermission('dashboard.operations'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getOperationsDashboard(getPool(), req.auth!));
  }),
);

portalRouter.get(
  '/dashboards/finance',
  requireAnyPermission('dashboard.finance', 'finance.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getFinanceDashboard(getPool(), req.auth!));
  }),
);

portalRouter.get(
  '/dashboards/customer',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getCustomerDashboard(getPool(), req.auth!));
  }),
);

portalRouter.get(
  '/dashboards/driver',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getDriverDashboard(getPool(), req.auth!));
  }),
);

portalRouter.get(
  '/search',
  requirePermission('search.read'),
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);
    sendSuccess(res, await globalSearch(getPool(), req.auth!, query));
  }),
);

portalRouter.get(
  '/me/profile',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getProfile(getPool(), req.auth!));
  }),
);

portalRouter.patch(
  '/me/profile',
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await updateProfile(getPool(), req.auth!, updateProfileSchema.parse(req.body)),
    );
  }),
);

portalRouter.get(
  '/me/customer-profile',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getCustomerProfile(getPool(), req.auth!));
  }),
);

portalRouter.get(
  '/organizations/:organizationId',
  requirePermission('org.settings'),
  asyncHandler(async (req, res) => {
    const { organizationId } = organizationIdParamSchema.parse(req.params);
    sendSuccess(res, await getOrganizationSettings(getPool(), req.auth!, organizationId));
  }),
);

portalRouter.patch(
  '/organizations/:organizationId',
  requirePermission('org.settings'),
  asyncHandler(async (req, res) => {
    const { organizationId } = organizationIdParamSchema.parse(req.params);
    sendSuccess(
      res,
      await updateOrganizationSettings(
        getPool(),
        req.auth!,
        organizationId,
        updateOrganizationSettingsSchema.parse(req.body),
      ),
    );
  }),
);

portalRouter.get(
  '/admin/users',
  requireAnyPermission('users.manage', 'users.read'),
  asyncHandler(async (req, res) => {
    const query = listUsersQuerySchema.parse(req.query);
    const result = await listAdminUsers(getPool(), req.auth!, query);
    sendSuccess(res, result.users, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

portalRouter.get(
  '/admin/users/:userId',
  requireAnyPermission('users.manage', 'users.read'),
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    sendSuccess(res, await getAdminUser(getPool(), req.auth!, userId));
  }),
);

portalRouter.patch(
  '/admin/users/:userId',
  requirePermission('users.manage'),
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const body = updateUserStatusSchema.parse(req.body);
    sendSuccess(res, await updateAdminUserStatus(getPool(), req.auth!, userId, body.status));
  }),
);

portalRouter.patch(
  '/admin/users/:userId/role',
  requirePermission('users.manage'),
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const body = updateUserRoleSchema.parse(req.body);
    sendSuccess(
      res,
      await updateAdminUserRole(getPool(), req.auth!, userId, body.role, body.organizationId),
    );
  }),
);

portalRouter.get(
  '/organizations/:organizationId/users',
  requireAnyPermission('users.manage', 'users.read'),
  asyncHandler(async (req, res) => {
    const { organizationId } = organizationIdParamSchema.parse(req.params);
    const result = await listOrganizationUsers(getPool(), req.auth!, organizationId);
    sendSuccess(res, result.users, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

portalRouter.get(
  '/admin/audit',
  requirePermission('audit.read'),
  asyncHandler(async (req, res) => {
    const query = listAuditQuerySchema.parse(req.query);
    const result = await listAuditLogs(getPool(), req.auth!, query);
    sendSuccess(res, result.logs, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

portalRouter.get(
  '/driver/trips',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listDriverTrips(getPool(), req.auth!));
  }),
);

portalRouter.get(
  '/driver/trips/:routeId',
  asyncHandler(async (req, res) => {
    const { routeId } = routeIdParamSchema.parse(req.params);
    sendSuccess(res, await getDriverTrip(getPool(), req.auth!, routeId));
  }),
);

portalRouter.post(
  '/driver/trips/:routeId/accept',
  asyncHandler(async (req, res) => {
    const { routeId } = routeIdParamSchema.parse(req.params);
    driverNoteSchema.parse(req.body ?? {});
    sendSuccess(res, await acceptDriverTrip(getPool(), req.auth!, routeId));
  }),
);

portalRouter.post(
  '/driver/trips/:routeId/start',
  asyncHandler(async (req, res) => {
    const { routeId } = routeIdParamSchema.parse(req.params);
    sendSuccess(res, await startDriverTrip(getPool(), req.auth!, routeId));
  }),
);

portalRouter.post(
  '/driver/trips/:routeId/complete',
  asyncHandler(async (req, res) => {
    const { routeId } = routeIdParamSchema.parse(req.params);
    sendSuccess(res, await completeDriverTrip(getPool(), req.auth!, routeId));
  }),
);

portalRouter.post(
  '/driver/stops/:stopId/arrive',
  asyncHandler(async (req, res) => {
    const { stopId } = stopIdParamSchema.parse(req.params);
    sendSuccess(res, await arriveDriverStop(getPool(), req.auth!, stopId));
  }),
);

portalRouter.post(
  '/driver/stops/:stopId/complete',
  asyncHandler(async (req, res) => {
    const { stopId } = stopIdParamSchema.parse(req.params);
    sendSuccess(res, await completeDriverStop(getPool(), req.auth!, stopId));
  }),
);

portalRouter.post(
  '/pod',
  requireAnyPermission('pod.create', 'pod.manage', 'shipments.upload_pod'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await submitProofOfDelivery(getPool(), req.auth!, submitPodSchema.parse(req.body)),
      201,
    );
  }),
);

portalRouter.get(
  '/pod/shipments/:shipmentId',
  requireAnyPermission('pod.read', 'pod.manage', 'shipments.upload_pod'),
  asyncHandler(async (req, res) => {
    const { shipmentId } = shipmentIdParamSchema.parse(req.params);
    sendSuccess(res, await getProofOfDelivery(getPool(), req.auth!, shipmentId));
  }),
);

portalRouter.post(
  '/pod/:podId/verify',
  requireAnyPermission('pod.manage'),
  asyncHandler(async (req, res) => {
    const { podId } = podIdParamSchema.parse(req.params);
    sendSuccess(
      res,
      await verifyProofOfDelivery(getPool(), req.auth!, podId, verifyPodSchema.parse(req.body)),
    );
  }),
);
