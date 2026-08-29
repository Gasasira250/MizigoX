import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { CustomerDetailPage } from '../features/customers/CustomerDetailPage';
import { CustomerFormPage } from '../features/customers/CustomerFormPage';
import { CustomersPage } from '../features/customers/CustomersPage';
import { ShipmentDetailPage } from '../features/shipments/ShipmentDetailPage';
import { ShipmentFormPage } from '../features/shipments/ShipmentFormPage';
import { ShipmentsPage } from '../features/shipments/ShipmentsPage';
import { FoundationPage } from '../features/system/FoundationPage';
import { LaterPhasePage } from '../features/system/LaterPhasePage';
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
          <Route path="/admin/customers" element={<CustomersPage />} />
          <Route path="/admin/customers/new" element={<CustomerFormPage />} />
          <Route path="/admin/customers/:customerId" element={<CustomerDetailPage />} />
          <Route path="/admin/customers/:customerId/edit" element={<CustomerFormPage />} />
          <Route path="/admin/shipments" element={<ShipmentsPage basePath="/admin" />} />
          <Route path="/admin/shipments/new" element={<ShipmentFormPage basePath="/admin" />} />
          <Route
            path="/admin/shipments/:shipmentId"
            element={<ShipmentDetailPage basePath="/admin" />}
          />
        </Route>
      </Route>

      <Route element={<RequireAuth allow={['portal']} />}>
        <Route element={<PortalShell title="Customer portal" />}>
          <Route path="/portal" element={<Navigate to="/portal/shipments" replace />} />
          <Route path="/portal/shipments" element={<ShipmentsPage basePath="/portal" />} />
          <Route path="/portal/shipments/new" element={<ShipmentFormPage basePath="/portal" />} />
          <Route
            path="/portal/shipments/:shipmentId"
            element={<ShipmentDetailPage basePath="/portal" />}
          />
        </Route>
      </Route>

      <Route element={<RequireAuth allow={['driver']} />}>
        <Route element={<PortalShell title="Driver portal" />}>
          <Route
            path="/driver"
            element={
              <LaterPhasePage
                title="Driver portal"
                phase="Later phase"
                description="Drivers will see assigned trips, update status, and upload proof of delivery here."
              />
            }
          />
        </Route>
      </Route>

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
