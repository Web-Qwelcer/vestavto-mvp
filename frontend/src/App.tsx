// Vercel deploy trigger
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import Toast from './components/Toast'
import HomePage from './pages/HomePage'
import ProductPage from './pages/ProductPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import OrdersPage from './pages/OrdersPage'
import OrderPage from './pages/OrderPage'

// Manager pages
import AdminProductsPage from './pages/admin/ProductsPage'
import AdminOrdersPage from './pages/admin/OrdersPage'
import AdminAnalyticsPage from './pages/admin/AnalyticsPage'

// "product_25"      → "product_deeplink"
// "src_facebook_may" → "facebook_may"
// "" / undefined    → "direct"
function parseSource(startParam: string): string {
  if (!startParam) return 'direct'
  if (startParam.startsWith('product_')) return 'product_deeplink'
  if (startParam.startsWith('src_')) return startParam.slice(4)
  return startParam
}

function IndexRoute() {
  const botMode = useAuthStore((s) => s.botMode)
  if (botMode === 'manager') return <Navigate to="/admin/products" replace />
  return <HomePage />
}

function StartParamHandler() {
  const navigate = useNavigate()
  const handled = useRef(false)
  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
    if (startParam?.startsWith('product_')) {
      const productId = startParam.replace('product_', '')
      navigate(`/product/${productId}`, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

declare global {
  interface Window {
    Telegram: {
      WebApp: {
        initData: string
        initDataUnsafe: {
          user?: {
            id: number
            first_name: string
            last_name?: string
            username?: string
          }
          start_param?: string
        }
        ready: () => void
        expand: () => void
        close: () => void
        openLink: (url: string) => void
        openTelegramLink: (url: string) => void
        MainButton: {
          text: string
          show: () => void
          hide: () => void
          onClick: (cb: () => void) => void
          offClick: (cb: () => void) => void
        }
        BackButton: {
          show: () => void
          hide: () => void
          onClick: (cb: () => void) => void
        }
        themeParams: {
          bg_color?: string
          text_color?: string
          button_color?: string
          button_text_color?: string
        }
      }
    }
  }
}

function App() {
  const { login, fetchUser, token, authError } = useAuthStore()

  useEffect(() => {
    const tg = window.Telegram?.WebApp

    if (tg) {
      tg.ready()
      tg.expand()

      if (tg.initData) {
        // Parse start_param into a traffic source
        const startParam = tg.initDataUnsafe?.start_param ?? ''
        const source = parseSource(startParam)
        login(tg.initData, source)
      } else if (token) {
        fetchUser()
      }
    } else if (token) {
      fetchUser()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-gray-700 font-medium mb-2">Помилка авторизації</p>
          <p className="text-sm text-gray-500">{authError}</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <StartParamHandler />
      <Toast />
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Client routes */}
          <Route index element={<IndexRoute />} />
          <Route path="product/:id" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="order/:id" element={<OrderPage />} />
          
          {/* Manager routes */}
          <Route path="admin/products" element={<AdminProductsPage />} />
          <Route path="admin/orders" element={<AdminOrdersPage />} />
          <Route path="admin/analytics" element={<AdminAnalyticsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
