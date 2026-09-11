const ICONS = {
  overview: 'M4 10.5 12 4l8 6.5V20H4z M9 20v-6h6v6',
  freight: 'M4 7h16v12H4z M8 7V5h8v2 M8 12h8',
  shipments: 'M4 6h16v4H4z M4 12h16v6H4z',
  tracking: 'M12 3a7 7 0 0 1 7 7c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 7-7zm0 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  carriers: 'M4 17V7h11l5 4v6H4z M8 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  drivers: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 4.5V20h16v-1.5C20 16 16 14 12 14z',
  vehicles: 'M5 16V9h9l4 4v3H5z M7 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  quotes: 'M7 4h10v16H7z M10 8h4 M10 12h4',
  invoices: 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',
  payments: 'M4 7h16v10H4z M4 11h16',
  customers: 'M8 10a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM2 19v-1c0-2 3-3.5 6-3.5s6 1.5 6 3.5V19zm10 0v-1c0-1 .4-1.8 1-2.4 1.3.6 2.8 1 4.5 1 1 0 2-.1 3-.4V19z',
  reports: 'M5 19V9h3v10H5zm6 0V5h3v14h-3zm6 0v-7h3v7h-3z',
  settings: 'M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5z M12 2l1.2 2.3 2.5-.4 1.2 2.2 2.2 1.2-.4 2.5L22 12l-2.3 1.2.4 2.5-2.2 1.2-1.2 2.2-2.5-.4L12 22l-1.2-2.3-2.5.4-1.2-2.2-2.2-1.2.4-2.5L2 12l2.3-1.2-.4-2.5 2.2-1.2 1.2-2.2 2.5.4z',
  bell: 'M12 4a5 5 0 0 1 5 5v5l1.5 2H5.5L7 14V9a5 5 0 0 1 5-5zm-2.2 14a2.2 2.2 0 0 0 4.4 0',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevron: 'M8 6l6 6-6 6',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm8 14-3.2-3.2',
  close: 'M6 6l12 12M18 6 6 18',
} as const

export type IconName = keyof typeof ICONS

export default function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ?? 'nav-icon'} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  )
}
