import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { CustomerDetailPage } from '../features/customers/CustomerDetailPage';
import { CustomerFormPage } from '../features/customers/CustomerFormPage';
import { CustomerProfilePage } from '../features/customers/CustomerProfilePage';
import { CustomersPage } from '../features/customers/CustomersPage';
import { ShipmentDetailPage } from '../features/shipments/ShipmentDetailPage';
import { ShipmentFormPage } from '../features/shipments/ShipmentFormPage';
import { DriverDetailPage } from '../features/drivers/DriverDetailPage';
import { DriverFormPage } from '../features/drivers/DriverFormPage';
import { DriversPage } from '../features/drivers/DriversPage';
import { ShipmentsPage } from '../features/shipments/ShipmentsPage';
import { VehicleDetailPage } from '../features/vehicles/VehicleDetailPage';
import { VehicleFormPage } from '../features/vehicles/VehicleFormPage';
import { VehiclesPage } from '../features/vehicles/VehiclesPage';
import { DispatchBoardPage } from '../features/dispatch/DispatchBoardPage';
import { RouteDetailPage } from '../features/routes/RouteDetailPage';
import { RouteFormPage } from '../features/routes/RouteFormPage';
import { RouteTimelinePage } from '../features/routes/RouteTimelinePage';
import { RoutesPage } from '../features/routes/RoutesPage';
import { DriverDashboardPage } from '../features/driver/DriverDashboardPage';
import { DriverRoutePage } from '../features/driver/DriverRoutePage';
import { DriverShipmentPage } from '../features/driver/DriverShipmentPage';
import { DriverTripsPage } from '../features/driver/DriverTripsPage';
import { DriverTrackingPage } from '../features/tracking/DriverTrackingPage';
import { LiveTrackingPage } from '../features/tracking/LiveTrackingPage';
import { PublicTrackPage } from '../features/tracking/PublicTrackPage';
import { RouteTrackingPage } from '../features/tracking/RouteTrackingPage';
import { CustomerTrackingPage } from '../features/tracking/CustomerTrackingPage';
import { ShipmentTrackingPage } from '../features/tracking/ShipmentTrackingPage';
import { VehicleTrackingPage } from '../features/tracking/VehicleTrackingPage';
import { InvoiceDetailPage } from '../features/billing/InvoiceDetailPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { NotificationPreferencesPage } from '../features/notifications/NotificationPreferencesPage';
import { NotificationDeliveriesPage } from '../features/notifications/NotificationDeliveriesPage';
import { InvoiceFormPage } from '../features/billing/InvoiceFormPage';
import { InvoicePrintPage } from '../features/billing/InvoicePrintPage';
import { InvoicesPage } from '../features/billing/InvoicesPage';
import { PaymentDetailPage } from '../features/billing/PaymentDetailPage';
import { PaymentFormPage } from '../features/billing/PaymentFormPage';
import { PaymentsPage } from '../features/billing/PaymentsPage';
import { OperationsDashboardPage } from '../features/dashboards/OperationsDashboardPage';
import { FinanceDashboardPage } from '../features/dashboards/FinanceDashboardPage';
import { CustomerDashboardPage } from '../features/dashboards/CustomerDashboardPage';
import { AdminUsersPage } from '../features/admin/AdminUsersPage';
import { AdminUserDetailPage } from '../features/admin/AdminUserDetailPage';
import {
  AdminOrganizationDetailPage,
  AdminOrganizationsPage,
} from '../features/admin/AdminOrganizationsPage';
import { AdminRolesPage } from '../features/admin/AdminRolesPage';
import { AuditLogsPage } from '../features/admin/AuditLogsPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ForbiddenPage, NotFoundPage } from '../features/system/AccessPages';
import { useAuth } from '../shared/auth/AuthProvider';
import { useCan } from '../shared/auth/can';
import { homePathFor } from '../shared/auth/home-path';
import { AppShell } from './shells/AppShell';

function GuestOnly() {
  const { ready, user } = useAuth();
  if (!ready) {
    return <BootScreen />;
  }
  if (user) {
    return <Navigate to={homePathFor(user)} replace />;
  }
  return <Outlet />;
}

function RequireAuth({ allow }: { allow: Array<'admin' | 'portal' | 'driver'> }) {
  const { ready, user } = useAuth();
  if (!ready) {
    return <BootScreen />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const destination = homePathFor(user);
  const current =
    user.role === 'DRIVER' ? 'driver' : user.organization.type === 'CUSTOMER' ? 'portal' : 'admin';
  if (!allow.includes(current)) {
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}

function RequirePermission({ anyOf }: { anyOf: string[] }) {
  const { canAny } = useCan();
  if (anyOf.length && !canAny(...anyOf)) {
    return <ForbiddenPage />;
  }
  return <Outlet />;
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Restoring secure session…
    </div>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth allow={['admin']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<OperationsDashboardPage />} />
          <Route element={<RequirePermission anyOf={['dashboard.finance', 'finance.read']} />}>
            <Route path="/admin/finance" element={<FinanceDashboardPage />} />
          </Route>
          <Route path="/admin/customers">
            <Route element={<RequirePermission anyOf={['customers.read']} />}>
              <Route index element={<CustomersPage />} />
              <Route path=":customerId" element={<CustomerDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={['customers.create', 'customers.update']} />}>
              <Route path="new" element={<CustomerFormPage />} />
              <Route path=":customerId/edit" element={<CustomerFormPage />} />
            </Route>
          </Route>
          <Route path="/admin/shipments">
            <Route element={<RequirePermission anyOf={['shipments.read']} />}>
              <Route index element={<ShipmentsPage basePath="/admin" />} />
              <Route path=":shipmentId" element={<ShipmentDetailPage basePath="/admin" />} />
            </Route>
            <Route element={<RequirePermission anyOf={['shipments.create', 'shipments.update']} />}>
              <Route path="new" element={<ShipmentFormPage basePath="/admin" />} />
              <Route path=":shipmentId/edit" element={<ShipmentFormPage basePath="/admin" />} />
            </Route>
          </Route>
          <Route path="/admin/vehicles">
            <Route element={<RequirePermission anyOf={['vehicles.read']} />}>
              <Route index element={<VehiclesPage />} />
              <Route path=":vehicleId/documents" element={<VehicleDetailPage />} />
              <Route path=":vehicleId" element={<VehicleDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={['vehicles.create', 'vehicles.update']} />}>
              <Route path="new" element={<VehicleFormPage />} />
              <Route path=":vehicleId/edit" element={<VehicleFormPage />} />
            </Route>
          </Route>
          <Route path="/admin/drivers">
            <Route element={<RequirePermission anyOf={['drivers.read']} />}>
              <Route index element={<DriversPage />} />
              <Route path=":driverId/documents" element={<DriverDetailPage />} />
              <Route path=":driverId" element={<DriverDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={['drivers.create', 'drivers.update']} />}>
              <Route path="new" element={<DriverFormPage />} />
              <Route path=":driverId/edit" element={<DriverFormPage />} />
            </Route>
          </Route>
          <Route path="/admin/routes">
            <Route element={<RequirePermission anyOf={['routes.read']} />}>
              <Route index element={<RoutesPage />} />
              <Route path=":routeId/timeline" element={<RouteTimelinePage />} />
              <Route path=":routeId" element={<RouteDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={['routes.create', 'routes.update']} />}>
              <Route path="new" element={<RouteFormPage />} />
              <Route path=":routeId/edit" element={<RouteFormPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission anyOf={['dispatch.read', 'routes.read']} />}>
            <Route path="/admin/dispatch" element={<DispatchBoardPage />} />
          </Route>
          <Route element={<RequirePermission anyOf={['tracking.read']} />}>
            <Route path="/admin/tracking">
              <Route index element={<LiveTrackingPage />} />
              <Route path="live" element={<LiveTrackingPage />} />
              <Route path="vehicles/:vehicleId" element={<VehicleTrackingPage />} />
              <Route path="routes/:routeId" element={<RouteTrackingPage />} />
              <Route path="shipments/:shipmentId" element={<ShipmentTrackingPage />} />
            </Route>
          </Route>
          <Route path="/admin/invoices">
            <Route element={<RequirePermission anyOf={['invoices.read']} />}>
              <Route index element={<InvoicesPage basePath="/admin" />} />
              <Route path=":invoiceId/print" element={<InvoicePrintPage basePath="/admin" />} />
              <Route path=":invoiceId" element={<InvoiceDetailPage basePath="/admin" />} />
            </Route>
            <Route element={<RequirePermission anyOf={['invoices.create', 'invoices.update']} />}>
              <Route path="new" element={<InvoiceFormPage basePath="/admin" />} />
              <Route path=":invoiceId/edit" element={<InvoiceFormPage basePath="/admin" />} />
            </Route>
          </Route>
          <Route path="/admin/payments">
            <Route element={<RequirePermission anyOf={['payments.read']} />}>
              <Route index element={<PaymentsPage />} />
              <Route path=":paymentId" element={<PaymentDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={['payments.create']} />}>
              <Route path="new" element={<PaymentFormPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission anyOf={['notifications.read']} />}>
            <Route path="/admin/notifications">
              <Route
                index
                element={
                  <NotificationsPage
                    basePath="/admin/notifications"
                    preferencesPath="/admin/notifications/preferences"
                  />
                }
              />
              <Route path="preferences" element={<NotificationPreferencesPage />} />
              <Route element={<RequirePermission anyOf={['notification_delivery.read']} />}>
                <Route path="deliveries" element={<NotificationDeliveriesPage />} />
              </Route>
            </Route>
          </Route>
          <Route element={<RequirePermission anyOf={['users.read', 'users.manage']} />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
          </Route>
          <Route element={<RequirePermission anyOf={['org.settings']} />}>
            <Route path="/admin/organizations" element={<AdminOrganizationsPage />} />
            <Route
              path="/admin/organizations/:organizationId"
              element={<AdminOrganizationDetailPage />}
            />
          </Route>
          <Route element={<RequirePermission anyOf={['users.manage']} />}>
            <Route path="/admin/roles" element={<AdminRolesPage />} />
          </Route>
          <Route element={<RequirePermission anyOf={['audit.read']} />}>
            <Route path="/admin/audit" element={<AuditLogsPage />} />
          </Route>
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<RequireAuth allow={['portal']} />}>
        <Route element={<AppShell />}>
          <Route path="/portal" element={<CustomerDashboardPage />} />
          <Route path="/portal/shipments">
            <Route index element={<ShipmentsPage basePath="/portal" />} />
            <Route path="new" element={<ShipmentFormPage basePath="/portal" />} />
            <Route path=":shipmentId/edit" element={<ShipmentFormPage basePath="/portal" />} />
            <Route path=":shipmentId/track" element={<CustomerTrackingPage />} />
            <Route path=":shipmentId" element={<ShipmentDetailPage basePath="/portal" />} />
          </Route>
          <Route path="/portal/invoices">
            <Route index element={<InvoicesPage basePath="/portal" />} />
            <Route path=":invoiceId/print" element={<InvoicePrintPage basePath="/portal" />} />
            <Route path=":invoiceId" element={<InvoiceDetailPage basePath="/portal" />} />
          </Route>
          <Route
            path="/portal/notifications"
            element={
              <NotificationsPage
                basePath="/portal/notifications"
                preferencesPath="/portal/notifications/preferences"
              />
            }
          />
          <Route
            path="/portal/notifications/preferences"
            element={<NotificationPreferencesPage />}
          />
          <Route path="/portal/profile" element={<CustomerProfilePage />} />
          <Route path="/portal/account" element={<ProfilePage />} />
          <Route path="/portal/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route element={<RequireAuth allow={['driver']} />}>
        <Route element={<AppShell />}>
          <Route path="/driver" element={<DriverDashboardPage />} />
          <Route path="/driver/trips" element={<DriverTripsPage />} />
          <Route path="/driver/trips/:routeId" element={<DriverRoutePage />} />
          <Route path="/driver/shipments/:shipmentId" element={<DriverShipmentPage />} />
          <Route path="/driver/tracking" element={<DriverTrackingPage />} />
          <Route
            path="/driver/notifications"
            element={
              <NotificationsPage
                basePath="/driver/notifications"
                preferencesPath="/driver/notifications/preferences"
              />
            }
          />
          <Route
            path="/driver/notifications/preferences"
            element={<NotificationPreferencesPage />}
          />
          <Route path="/driver/profile" element={<ProfilePage />} />
          <Route path="/driver/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/track/:token" element={<PublicTrackPage />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function RootRedirect() {
  const { ready, user } = useAuth();
  if (!ready) {
    return <BootScreen />;
  }
  return <Navigate to={homePathFor(user)} replace />;
}
