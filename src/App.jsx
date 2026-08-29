import { useState } from 'react'
import Shipments from './pages/Shipments'
import './App.css'
function App() {
    const [activePage, setActivePage] = useState('Dashboard')
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>MizigoX</h1>
          <span>Freight & Logistics</span>
        </div>

        <div className="topbar-actions">
          <button type="button">Notifications</button>
          <button type="button">Profile</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          {[
  'Dashboard',
  'Shipments',
  'Customers',
  'Vehicles',
  'Drivers',
  'Routes',
  'Tracking',
  'Invoices',
  'Settings',
].map((page) => (
  <button
    key={page}
    type="button"
    className={`nav-item ${activePage === page ? 'active' : ''}`}
    onClick={() => setActivePage(page)}
  >
    {page}
  </button>
))}
        </aside>

        
        <main className="main-content">
  {activePage === 'Shipments' ? (
    <Shipments />
  ) : (
    <>
      <div className="page-heading">
        <p className="eyebrow">MIZIGOX</p>
        <h2>{activePage}</h2>
        <p>
          {activePage === 'Dashboard'
            ? 'Welcome to your MizigoX logistics control center.'
            : `Manage your ${activePage.toLowerCase()} from MizigoX.`}
        </p>
      </div>

      <section className="stats-grid">
        <div className="stat-card">
          <span>Active Shipments</span>
          <strong>0</strong>
        </div>

        <div className="stat-card">
          <span>Vehicles</span>
          <strong>0</strong>
        </div>

        <div className="stat-card">
          <span>Drivers</span>
          <strong>0</strong>
        </div>

        <div className="stat-card">
          <span>Pending Invoices</span>
          <strong>0</strong>
        </div>
      </section>

      <section className="welcome-panel">
        <h3>Welcome to MizigoX</h3>
        <p>
          Your logistics operations will be managed from this dashboard.
          We will build each module step-by-step.
        </p>
      </section>
    </>
  )}
</main>
      </div>
    </div>
  )
}

export default App