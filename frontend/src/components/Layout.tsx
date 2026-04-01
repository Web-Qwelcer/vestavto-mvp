import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cart'
import { useAuthStore } from '../store/auth'
import { getBotMode } from '../botMode'

// ── Tab definitions ──────────────────────────────────────────────────────────

interface Tab {
  path: string
  label: string
  icon: string
  exact?: boolean
  badge?: number
}

// Pages where we show ← Назад instead of the logo
// (detail pages, not reachable from tab bar)
const DETAIL_PREFIXES = ['/product/', '/order/', '/checkout']

function isDetailPath(pathname: string) {
  return DETAIL_PREFIXES.some(p => pathname.startsWith(p))
}

function isTabActive(tab: Tab, pathname: string) {
  if (tab.exact) return pathname === tab.path
  return pathname.startsWith(tab.path)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Layout() {
  const itemsCount = useCartStore(s => s.itemsCount())
  const { isManager } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  const clientTabs: Tab[] = [
    { path: '/',        label: 'Каталог',    icon: '🏠', exact: true },
    { path: '/orders',  label: 'Замовлення', icon: '📋' },
    { path: '/cart',    label: 'Кошик',      icon: '🛒', badge: itemsCount },
  ]

  const managerTabs: Tab[] = getBotMode() === 'manager'
    ? [
        { path: '/admin/products',  label: 'Товари',     icon: '📦' },
        { path: '/admin/orders',    label: 'Замовлення', icon: '📋' },
        { path: '/admin/analytics', label: 'Аналітика',  icon: '📊' },
      ]
    : [
        { path: '/admin/products', label: 'Товари',    icon: '📦' },
        { path: '/admin/orders',   label: 'Замовлення', icon: '📋' },
        { path: '/',               label: 'Магазин',   icon: '👁', exact: true },
      ]

  const tabs = isManager ? managerTabs : clientTabs
  const showBack = isDetailPath(location.pathname)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          {showBack ? (
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-primary font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Назад
            </button>
          ) : (
            <Link
              to={isManager ? '/admin/orders' : '/'}
              className="text-xl font-bold text-primary"
            >
              VestAvto
            </Link>
          )}
        </div>
      </header>

      {/* ── Page content — extra bottom padding so tabs don't overlap ── */}
      <main className="max-w-lg mx-auto pb-20">
        <Outlet />
      </main>

      {/* ── Bottom Tab Bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-50 safe-area-bottom">
        <div className="max-w-lg mx-auto flex">
          {tabs.map((tab) => {
            const active = isTabActive(tab, location.pathname)
            return (
              <Link
                key={tab.path + tab.label}
                to={tab.path}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative transition-colors ${
                  active ? 'text-primary' : 'text-gray-400'
                }`}
              >
                {/* Icon + optional badge */}
                <span className="relative leading-none">
                  <span className="text-[22px]">{tab.icon}</span>
                  {(tab.badge ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-primary text-white text-[10px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center leading-none">
                      {tab.badge}
                    </span>
                  )}
                </span>

                {/* Label */}
                <span className="text-[11px] font-medium leading-none">{tab.label}</span>

                {/* Active indicator bar */}
                {active && (
                  <span className="absolute top-0 left-3 right-3 h-[2px] bg-primary rounded-b" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
