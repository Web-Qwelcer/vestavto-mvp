import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useCartStore } from '../store/cart'
import { useAuthStore } from '../store/auth'
import { parseSource } from '../botMode'

// ── Validation helpers ──────────────────────────────────────────────────────

/** Залишає лише цифри, потім знімає код країни 38 якщо 12 цифр */
function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('38')) return digits.slice(2)
  return digits
}

function validatePhone(value: string): string {
  const normalized = normalizePhone(value)
  if (!/^\d{10}$/.test(normalized)) return 'Невірний номер телефону (має бути 10 цифр)'
  return ''
}

function validateName(value: string): string {
  const trimmed = value.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 2) return "Введіть ім'я та прізвище"
  // Дозволяємо кирилицю, латиницю, пробіл, апостроф, дефіс
  if (!/^[\u0400-\u04FFa-zA-Z'\- ]+$/.test(trimmed)) return "Введіть ім'я та прізвище"
  return ''
}

// ── Component ───────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { items, total, depositTotal, clearCart } = useCartStore()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    recipient_name: '',
    recipient_phone: '',
    np_city_ref: '',
    np_city_name: '',
    np_warehouse_ref: '',
    np_warehouse_name: '',
    payment_type: 'deposit' as 'deposit' | 'full'
  })

  const [citySearch, setCitySearch] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')

  // Validation state
  const [touched, setTouched] = useState({ recipient_name: false, recipient_phone: false })
  const [fieldErrors, setFieldErrors] = useState({ recipient_name: '', recipient_phone: '' })

  // City search
  const { data: cities } = useQuery({
    queryKey: ['cities', citySearch],
    queryFn: async () => {
      if (citySearch.length < 2) return []
      const res = await api.get('/delivery/cities', { params: { query: citySearch } })
      return res.data
    },
    enabled: citySearch.length >= 2
  })

  // Warehouse search
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', form.np_city_ref, warehouseSearch],
    queryFn: async () => {
      if (!form.np_city_ref) return []
      const res = await api.get('/delivery/warehouses', {
        params: { city_ref: form.np_city_ref, search: warehouseSearch }
      })
      return res.data
    },
    enabled: !!form.np_city_ref
  })

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Create order
  const createOrder = useMutation({
    mutationFn: async () => {
      const { botMode } = useAuthStore.getState()
      const source = botMode === 'client'
        ? parseSource(window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? '')
        : null
      const res = await api.post('/orders', {
        items: items.map(i => ({ product_id: i.id, quantity: i.quantity })),
        payment_type: form.payment_type,
        recipient_name: form.recipient_name.trim(),
        recipient_phone: normalizePhone(form.recipient_phone),
        np_city_ref: form.np_city_ref,
        np_city_name: form.np_city_name,
        np_warehouse_ref: form.np_warehouse_ref,
        np_warehouse_name: form.np_warehouse_name,
        source,
      })
      return res.data
    },
    onSuccess: async (order) => {
      clearCart()
      try {
        const payRes = await api.post('/payments/create', {
          order_id: order.id,
          payment_type: form.payment_type
        })
        const pageUrl = payRes.data.page_url
        const tg = window.Telegram?.WebApp
        if (tg?.openLink) {
          tg.openLink(pageUrl)
        } else {
          window.open(pageUrl, '_blank')
        }
        navigate(`/order/${order.id}`)
      } catch (err: any) {
        setErrorMsg(err?.response?.data?.detail || 'Помилка створення платежу')
        navigate(`/order/${order.id}`)
      }
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.detail || 'Помилка створення замовлення')
    }
  })

  // ── Handlers ──

  const handleNameChange = (value: string) => {
    setForm(f => ({ ...f, recipient_name: value }))
    if (touched.recipient_name) {
      setFieldErrors(prev => ({ ...prev, recipient_name: validateName(value) }))
    }
  }

  const handlePhoneChange = (value: string) => {
    setForm(f => ({ ...f, recipient_phone: value }))
    if (touched.recipient_phone) {
      setFieldErrors(prev => ({ ...prev, recipient_phone: validatePhone(value) }))
    }
  }

  const handleNameBlur = () => {
    setTouched(prev => ({ ...prev, recipient_name: true }))
    setFieldErrors(prev => ({ ...prev, recipient_name: validateName(form.recipient_name) }))
  }

  const handlePhoneBlur = () => {
    setTouched(prev => ({ ...prev, recipient_phone: true }))
    setFieldErrors(prev => ({ ...prev, recipient_phone: validatePhone(form.recipient_phone) }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    // Touch all validated fields and run full check
    const nameErr = validateName(form.recipient_name)
    const phoneErr = validatePhone(form.recipient_phone)
    setTouched({ recipient_name: true, recipient_phone: true })
    setFieldErrors({ recipient_name: nameErr, recipient_phone: phoneErr })

    if (nameErr || phoneErr) return
    createOrder.mutate()
  }

  const selectCity = (city: any) => {
    setForm(f => ({ ...f, np_city_ref: city.ref, np_city_name: city.name, np_warehouse_ref: '', np_warehouse_name: '' }))
    setCitySearch(city.name)
  }

  const selectWarehouse = (wh: any) => {
    setForm(f => ({ ...f, np_warehouse_ref: wh.ref, np_warehouse_name: wh.name }))
    setWarehouseSearch(wh.name)
  }

  // Button disabled when there are known errors or form is pending
  const hasFieldErrors = !!fieldErrors.recipient_name || !!fieldErrors.recipient_phone
  const isSubmitDisabled = hasFieldErrors || createOrder.isPending

  const payAmount = form.payment_type === 'deposit' ? depositTotal() : total()

  return (
    <div className="p-4 pb-44">
      <h1 className="text-xl font-bold mb-4">Оформлення</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Contact */}
        <div className="card">
          <h2 className="font-medium mb-3">Контактні дані</h2>

          {/* Name */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Прізвище Ім'я По-батькові"
              value={form.recipient_name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={handleNameBlur}
              className={`w-full p-3 border rounded-lg ${fieldErrors.recipient_name ? 'border-red-400 bg-red-50' : ''}`}
              required
            />
            {fieldErrors.recipient_name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.recipient_name}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <input
              type="tel"
              placeholder="0671234567 або +380671234567"
              value={form.recipient_phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onBlur={handlePhoneBlur}
              className={`w-full p-3 border rounded-lg ${fieldErrors.recipient_phone ? 'border-red-400 bg-red-50' : ''}`}
              required
            />
            {fieldErrors.recipient_phone && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.recipient_phone}</p>
            )}
          </div>
        </div>

        {/* Delivery */}
        <div className="card">
          <h2 className="font-medium mb-3">Доставка (Нова Пошта)</h2>

          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Місто"
              value={citySearch}
              onChange={(e) => { setCitySearch(e.target.value); setForm(f => ({ ...f, np_city_ref: '' })) }}
              className="w-full p-3 border rounded-lg"
              required
            />
            {cities && cities.length > 0 && !form.np_city_ref && (
              <div className="absolute top-full left-0 right-0 bg-white border rounded-lg mt-1 max-h-48 overflow-y-auto z-10">
                {cities.map((c: any) => (
                  <button
                    key={c.ref}
                    type="button"
                    onClick={() => selectCity(c)}
                    className="w-full p-3 text-left hover:bg-gray-50 border-b last:border-0"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Відділення"
              value={warehouseSearch}
              onChange={(e) => { setWarehouseSearch(e.target.value); setForm(f => ({ ...f, np_warehouse_ref: '' })) }}
              className="w-full p-3 border rounded-lg"
              disabled={!form.np_city_ref}
              required
            />
            {warehouses && warehouses.length > 0 && !form.np_warehouse_ref && (
              <div className="absolute top-full left-0 right-0 bg-white border rounded-lg mt-1 max-h-48 overflow-y-auto z-10">
                {warehouses.map((w: any) => (
                  <button
                    key={w.ref}
                    type="button"
                    onClick={() => selectWarehouse(w)}
                    className="w-full p-3 text-left hover:bg-gray-50 border-b last:border-0 text-sm"
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payment type */}
        <div className="card">
          <h2 className="font-medium mb-3">Оплата</h2>

          <label className="flex items-center gap-3 p-3 border rounded-lg mb-2 cursor-pointer">
            <input
              type="radio"
              name="payment"
              checked={form.payment_type === 'deposit'}
              onChange={() => setForm(f => ({ ...f, payment_type: 'deposit' }))}
            />
            <div>
              <div className="font-medium">Завдаток</div>
              <div className="text-sm text-gray-500">{depositTotal()} ₴ зараз, решта при отриманні</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
            <input
              type="radio"
              name="payment"
              checked={form.payment_type === 'full'}
              onChange={() => setForm(f => ({ ...f, payment_type: 'full' }))}
            />
            <div>
              <div className="font-medium">Повна оплата</div>
              <div className="text-sm text-gray-500">{total()} ₴</div>
            </div>
          </label>
        </div>

        {/* Fixed bottom */}
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-white border-t">
          <div className="max-w-lg mx-auto">
            {errorMsg && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {errorMsg}
              </div>
            )}
            <div className="flex justify-between mb-3">
              <span>До оплати:</span>
              <span className="font-bold text-lg">{payAmount} ₴</span>
            </div>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`btn-primary w-full py-3 transition-opacity ${
                isSubmitDisabled ? 'opacity-40 cursor-not-allowed' : 'opacity-100'
              }`}
            >
              {createOrder.isPending ? 'Обробка...' : 'Оформити замовлення'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
