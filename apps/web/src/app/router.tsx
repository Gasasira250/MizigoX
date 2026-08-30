import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { CustomerDetailPage } from '../features/customers/CustomerDetailPage';
import { CustomerFormPage } from '../features/customers/CustomerFormPage';
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
import { DriverTrackingPage } from '../features/tracking/DriverTrackingPage';
import { LiveTrackingPage } from '../features/tracking/LiveTrackingPage';
import { PublicTrackPage } from '../features/tracking/PublicTrackPage';
import { RouteTrackingPage } from '../features/tracking/RouteTrackingPage';
import { ShipmentTrackingPage } from '../features/tracking/ShipmentTrackingPage';
import { VehicleTrackingPage } from '../features/tracking/VehicleTrackingPage';
import { InvoiceDetailPage } from '../features/billing/InvoiceDetailPage';
import { InvoiceFormPage } from '../features/billing/InvoiceFormPage';
import { InvoicePrintPage } from '../features/billing/InvoicePrintPage';
import { InvoicesPage } from '../features/billing/InvoicesPage';
import { PaymentDetailPage } from '../features/billing/PaymentDetailPage';
import { PaymentFormPage } from '../features/billing/PaymentFormPage';
import { PaymentsPage } from '../features/billing/PaymentsPage';
import { FoundationPage } from '../features/system/FoundationPage';
import { useAuth } from '../shared/auth/AuthProvider';
import { homePathFor } from '../shared/auth/home-path';
import { AdminShell } from './shells/AdminShell';
import { PortalShell } from './shells/PortalShell';

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
    destination === '/admin' ? 'admin' : destination === '/portal' ? 'portal' : 'driver';
  if (!allow.includes(current)) {
    return <Navigate to={destination} replace />;
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
      </Route>
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth allow={['admin']} />}>
        <Route element={<AdminShell />}>
          <Route path="/admin" element={<FoundationPage />} />
          <Route path="/admin/customers">
            <Route index element={<CustomersPage />} />
            <Route path="new" element={<CustomerFormPage />} />
            <Route path=":customerId/edit" element={<CustomerFormPage />} />
            <Route path=":customerId" element={<CustomerDetailPage />} />
          </Route>
          <Route path="/admin/shipments">
            <Route index element={<ShipmentsPage basePath="/admin" />} />
            <Route path="new" element={<ShipmentFormPage basePath="/admin" />} />
            <Route path=":shipmentId/edit" element={<ShipmentFormPage basePath="/admin" />} />
            <Route path=":shipmentId" element={<ShipmentDetailPage basePath="/admin" />} />
          </Route>
          <Route path="/admin/vehicles">
            <Route index element={<VehiclesPage />} />
            <Route path="new" element={<VehicleFormPage />} />
            <Route path=":vehicleId/edit" element={<VehicleFormPage />} />
            <Route path=":vehicleId/documents" element={<VehicleDetailPage />} />
            <Route path=":vehicleId" element={<VehicleDetailPage />} />
          </Route>
          <Route path="/admin/drivers">
            <Route index element={<DriversPage />} />
            <Route path="new" element={<DriverFormPage />} />
            <Route path=":driverId/edit" element={<DriverFormPage />} />
            <Route path=":driverId/documents" element={<DriverDetailPage />} />
            <Route path=":driverId" element={<DriverDetailPage />} />
          </Route>
          <Route path="/admin/routes">
            <Route index element={<RoutesPage />} />
            <Route path="new" element={<RouteFormPage />} />
            <Route path=":routeId/edit" element={<RouteFormPage />} />
            <Route path=":routeId/timeline" element={<RouteTimelinePage />} />
            <Route path=":routeId" element={<RouteDetailPage />} />
          </Route>
          <Route path="/admin/dispatch" element={<DispatchBoardPage />} />
          <Route path="/admin/tracking">
            <Route index element={<LiveTrackingPage />} />
            <Route path="live" element={<LiveTrackingPage />} />
            <Route path="vehicles/:vehicleId" element={<VehicleTrackingPage />} />
            <Route path="routes/:routeId" element={<RouteTrackingPage />} />
            <Route path="shipments/:shipmentId" element={<ShipmentTrackingPage />} />
          </Route>
          <Route path="/admin/invoices">
            <Route index element={<InvoicesPage basePath="/admin" />} />
            <Route path="new" element={<InvoiceFormPage basePath="/admin" />} />
            <Route path=":invoiceId/edit" element={<InvoiceFormPage basePath="/admin" />} />
            <Route path=":invoiceId/print" element={<InvoicePrintPage basePath="/admin" />} />
            <Route path=":invoiceId" element={<InvoiceDetailPage basePath="/admin" />} />
          </Route>
          <Route path="/admin/payments">
            <Route index element={<PaymentsPage />} />
            <Route path="new" element={<PaymentFormPage />} />
            <Route path=":paymentId" element={<PaymentDetailPage />} />
          </Route>
        </Route>
      </Route>

      <Route element={<RequireAuth allow={['portal']} />}>
        <Route element={<PortalShell title="Customer portal" />}>
          <Route path="/portal" element={<Navigate to="/portal/shipments" replace />} />
          <Route path="/portal/shipments">
            <Route index element={<ShipmentsPage basePath="/portal" />} />
            <Route path="new" element={<ShipmentFormPage basePath="/portal" />} />
            <Route path=":shipmentId/edit" element={<ShipmentFormPage basePath="/portal" />} />
            <Route path=":shipmentId" element={<ShipmentDetailPage basePath="/portal" />} />
          </Route>
          <Route path="/portal/invoices">
            <Route index element={<InvoicesPage basePath="/portal" />} />
            <Route path=":invoiceId/print" element={<InvoicePrintPage basePath="/portal" />} />
            <Route path=":invoiceId" element={<InvoiceDetailPage basePath="/portal" />} />
          </Route>
        </Route>
      </Route>

      <Route element={<RequireAuth allow={['driver']} />}>
        <Route element={<PortalShell title="Driver portal" />}>
          <Route path="/driver" element={<DriverTrackingPage />} />
        </Route>
      </Route>

      <Route path="/track/:token" element={<PublicTrackPage />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
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
