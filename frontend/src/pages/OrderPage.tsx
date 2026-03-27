import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import api from '../api'

const STATUS_LABELS: Record<string, string> = {
  new:              'Нове',
  pending_payment:  'Очікує оплати',
  deposit_paid:     'Завдаток сплачено',
  paid:             'Оплачено',
  processing:       'В обробці',
  shipped:          'Відправлено',
  delivered:        'Доставлено',
  cancelled:        'Скасовано',
}

export default function OrderPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

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

  const handlePay = async () => {
    if (!order) return
    setPaying(true)
    setPayError(null)

    try {
      const res = await api.post('/payments/create', {
        order_id: order.id,
        payment_type: order.payment_type,
      })

      const { page_url } = res.data

      // Відкриваємо посилання через Telegram WebApp або fallback
      const tg = (window as any).Telegram?.WebApp
      if (tg?.openLink) {
        tg.openLink(page_url)
      } else {
        window.open(page_url, '_blank')
      }

      // Оновлюємо дані замовлення після переходу
      await queryClient.invalidateQueries({ queryKey: ['order', id] })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setPayError(detail || 'Помилка при створенні рахунку')
    } finally {
      setPaying(false)
    }
  }

  if (isLoading) return <div className="p-4 text-center">Завантаження...</div>
  if (!order) return <div className="p-4 text-center">Замовлення не знайдено</div>

  const canPay = order.status === 'new' || order.status === 'pending_payment'
  const isDeposit = order.payment_type === 'deposit'
  const payAmount = isDeposit ? order.deposit_amount : (order.total_amount - order.paid_amount)
  const payLabel = isDeposit ? 'Оплатити завдаток' : 'Оплатити повністю'

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Замовлення #{order.id}</h1>

      {/* Status */}
      <div className="card mb-4">
        <h3 className="text-sm text-gray-500 mb-1">Статус</h3>
        <div className="font-medium">{STATUS_LABELS[order.status] ?? order.status}</div>
      </div>

      {/* Pay button */}
      {canPay && (
        <div className="mb-4">
          {payError && (
            <div className="text-red-500 text-sm mb-2">{payError}</div>
          )}
          <button
            className="btn-primary w-full"
            onClick={handlePay}
            disabled={paying}
          >
            {paying ? 'Зачекайте...' : `${payLabel} ${payAmount} ₴`}
          </button>
        </div>
      )}

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
