import type { AppRole } from './format'
import type { IconName } from './components/Icon'

export type NavItem = {
  to: string
  label: string
  icon: IconName
  end?: boolean
  roles: AppRole[]
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { to: '/', label: 'Overview', icon: 'overview', end: true, roles: ['ops', 'customer', 'carrier', 'driver'] },
      { to: '/dispatch', label: 'Freight requests', icon: 'freight', roles: ['ops', 'carrier', 'driver'] },
      { to: '/loads', label: 'Shipments', icon: 'shipments', roles: ['ops', 'customer', 'carrier', 'driver'] },
      { to: '/tracking', label: 'Tracking', icon: 'tracking', roles: ['ops', 'customer', 'carrier', 'driver'] },
    ],
  },
  {
    label: 'Network',
    items: [
      { to: '/transporters', label: 'Carriers', icon: 'carriers', roles: ['ops'] },
      { to: '/fleet?tab=drivers', label: 'Drivers', icon: 'drivers', roles: ['ops', 'carrier'] },
      { to: '/fleet?tab=trucks', label: 'Vehicles', icon: 'vehicles', roles: ['ops', 'carrier'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/quotes', label: 'Quotes', icon: 'quotes', roles: ['ops', 'customer', 'carrier'] },
      { to: '/invoices', label: 'Invoices', icon: 'invoices', roles: ['ops', 'customer'] },
      { to: '/payments', label: 'Payments', icon: 'payments', roles: ['ops', 'carrier'] },
    ],
  },
  {
    label: 'Management',
    items: [
      { to: '/customers', label: 'Customers', icon: 'customers', roles: ['ops'] },
      { to: '/reports', label: 'Reports', icon: 'reports', roles: ['ops'] },
      { to: '/settings', label: 'Settings', icon: 'settings', roles: ['ops', 'customer', 'carrier', 'driver'] },
    ],
  },
]
