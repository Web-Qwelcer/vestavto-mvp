import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import api from '../api'

export default function OrderPage() {
  const { id } = useParams()

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await api.get(`/orders/${id}`)
      return res.data
    }
  })

  const { data: tracking } = useQuery({
    queryKey: ['tracking', id],
    queryFn: async () => {
      const res = await api.get(`/delivery/${id}/track`)
      return res.data
    },
    enabled: !!order?.ttn_number
  })

  if (isLoading) return <div className="p-4 text-center">Завантаження...</div>
  if (!order) return <div className="p-4 text-center">Замовлення не знайдено</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Замовлення #{order.id}</h1>

      {/* Status */}
      <div className="card mb-4">
        <h3 className="text-sm text-gray-500 mb-1">Статус</h3>
        <div className="font-medium">{order.status}</div>
      </div>

      {/* TTN tracking */}
      {order.ttn_number && (
        <div className="card mb-4">
          <h3 className="text-sm text-gray-500 mb-1">ТТН Нова Пошта</h3>
          <div className="font-medium text-primary">{order.ttn_number}</div>
          {tracking?.status && (
            <div className="text-sm text-gray-600 mt-1">{tracking.status}</div>
          )}
        </div>
      )}

      {/* Items */}
      <div className="card mb-4">
        <h3 className="font-medium mb-3">Товари</h3>
        <div className="space-y-2">
          {order.items?.map((item: any) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.product_name} × {item.quantity}</span>
              <span>{item.price * item.quantity} ₴</span>
            </div>
          ))}
        </div>
        <div className="border-t mt-3 pt-3 flex justify-between font-bold">
          <span>Разом</span>
          <span>{order.total_amount} ₴</span>
        </div>
        {order.paid_amount > 0 && (
          <div className="flex justify-between text-sm text-green-600 mt-1">
            <span>Сплачено</span>
            <span>{order.paid_amount} ₴</span>
          </div>
        )}
      </div>

      {/* Delivery */}
      <div className="card">
        <h3 className="font-medium mb-3">Доставка</h3>
        <div className="text-sm space-y-1">
          <div>{order.recipient_name}</div>
          <div>{order.recipient_phone}</div>
          <div className="text-gray-600">{order.np_city_name}</div>
          <div className="text-gray-600">{order.np_warehouse_name}</div>
        </div>
      </div>
    </div>
  )
}
