import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import Layout from './components/Layout'
import { ToastProvider } from './components/system'
import CustomersPage from './pages/Customers'
import DashboardPage from './pages/Dashboard'
import DispatchPage from './pages/Dispatch'
import FinancePage from './pages/Finance'
import FleetPage from './pages/Fleet'
import LoadDetailPage from './pages/LoadDetail'
import LoadsPage from './pages/Loads'
import Login from './pages/Login'
import ReportsPage from './pages/Reports'
import SettingsPage from './pages/Settings'
import TrackingPage from './pages/Tracking'
import TransportersPage from './pages/Transporters'
import type { ReactNode } from 'react'

function Guard({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return <p className="boot">Loading MizigoX…</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Guard>
                <Layout />
              </Guard>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="loads" element={<LoadsPage />} />
            <Route path="loads/:id" element={<LoadDetailPage />} />
            <Route path="dispatch" element={<DispatchPage />} />
            <Route path="transporters" element={<TransportersPage />} />
            <Route path="tracking" element={<TrackingPage />} />
            <Route path="fleet" element={<FleetPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="quotes" element={<FinancePage kind="quotes" />} />
            <Route path="invoices" element={<FinancePage kind="invoices" />} />
            <Route path="payments" element={<FinancePage kind="payments" />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
