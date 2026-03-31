import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ProductPage from './pages/ProductPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import OrdersPage from './pages/OrdersPage'
import OrderPage from './pages/OrderPage'

// Manager pages
import AdminProductsPage from './pages/admin/ProductsPage'
import AdminOrdersPage from './pages/admin/OrdersPage'

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
        // Fresh Telegram session — authenticate
        login(tg.initData)
      } else if (token) {
        // App reloaded without new initData — restore user from saved token
        fetchUser()
      }
    } else if (token) {
      // Outside Telegram (browser/dev) — restore user state from saved token
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
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Client routes */}
          <Route index element={<HomePage />} />
          <Route path="product/:id" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="order/:id" element={<OrderPage />} />
          
          {/* Manager routes */}
          <Route path="admin/products" element={<AdminProductsPage />} />
          <Route path="admin/orders" element={<AdminOrdersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
