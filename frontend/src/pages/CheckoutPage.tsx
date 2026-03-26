import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../api'
import { useCartStore } from '../store/cart'

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, total, depositTotal, clearCart } = useCartStore()
  
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

  // Create order
  const createOrder = useMutation({
    mutationFn: async () => {
      const res = await api.post('/orders', {
        items: items.map(i => ({ product_id: i.id, quantity: i.quantity })),
        payment_type: form.payment_type,
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone,
        np_city_ref: form.np_city_ref,
        np_city_name: form.np_city_name,
        np_warehouse_ref: form.np_warehouse_ref,
        np_warehouse_name: form.np_warehouse_name
      })
      return res.data
    },
    onSuccess: async (order) => {
      // Create payment
      const payRes = await api.post('/payments/create', {
        order_id: order.id,
        payment_type: form.payment_type
      })
      clearCart()
      // Redirect to Monobank payment page
      window.location.href = payRes.data.page_url
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createOrder.mutate()
  }

  const selectCity = (city: any) => {
    setForm({ ...form, np_city_ref: city.ref, np_city_name: city.name, np_warehouse_ref: '', np_warehouse_name: '' })
    setCitySearch(city.name)
  }

  const selectWarehouse = (wh: any) => {
    setForm({ ...form, np_warehouse_ref: wh.ref, np_warehouse_name: wh.name })
    setWarehouseSearch(wh.name)
  }

  const payAmount = form.payment_type === 'deposit' ? depositTotal() : total()

  return (
    <div className="p-4 pb-32">
      <h1 className="text-xl font-bold mb-4">Оформлення</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Contact */}
        <div className="card">
          <h2 className="font-medium mb-3">Контактні дані</h2>
          
          <input
            type="text"
            placeholder="ПІБ отримувача"
            value={form.recipient_name}
            onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
            className="w-full p-3 border rounded-lg mb-3"
            required
          />
          
          <input
            type="tel"
            placeholder="Телефон (380...)"
            value={form.recipient_phone}
            onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })}
            className="w-full p-3 border rounded-lg"
            required
          />
        </div>

        {/* Delivery */}
        <div className="card">
          <h2 className="font-medium mb-3">Доставка (Нова Пошта)</h2>
          
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Місто"
              value={citySearch}
              onChange={(e) => { setCitySearch(e.target.value); setForm({ ...form, np_city_ref: '' }) }}
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
              onChange={(e) => { setWarehouseSearch(e.target.value); setForm({ ...form, np_warehouse_ref: '' }) }}
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
              onChange={() => setForm({ ...form, payment_type: 'deposit' })}
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
              onChange={() => setForm({ ...form, payment_type: 'full' })}
            />
            <div>
              <div className="font-medium">Повна оплата</div>
              <div className="text-sm text-gray-500">{total()} ₴</div>
            </div>
          </label>
        </div>
      </form>

      {/* Fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <div className="max-w-lg mx-auto">
          <div className="flex justify-between mb-3">
            <span>До оплати:</span>
            <span className="font-bold text-lg">{payAmount} ₴</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={createOrder.isPending}
            className="btn-primary w-full py-3 disabled:opacity-50"
          >
            {createOrder.isPending ? 'Обробка...' : 'Оплатити'}
          </button>
        </div>
      </div>
    </div>
  )
}
