import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../api'

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'Новий', color: 'bg-gray-100' },
  pending_payment: { label: 'Очікує оплати', color: 'bg-yellow-100' },
  deposit_paid: { label: 'Завдаток сплачено', color: 'bg-blue-100' },
  paid: { label: 'Оплачено', color: 'bg-green-100' },
  processing: { label: 'Обробляється', color: 'bg-blue-100' },
  shipped: { label: 'Відправлено', color: 'bg-purple-100' },
  delivered: { label: 'Доставлено', color: 'bg-green-200' },
  cancelled: { label: 'Скасовано', color: 'bg-red-100' },
}

export default function OrdersPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await api.get('/orders')
      return res.data
    }
  })

  if (isLoading) return <div className="p-4 text-center text-ink">Завантаження...</div>

  return (
    <div className="p-4 text-ink">
      <h1 className="text-xl font-bold mb-4 text-ink">Мої замовлення</h1>

      {orders?.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Замовлень поки немає
        </div>
      ) : (
        <div className="space-y-3">
          {orders?.map((order: any) => (
            <Link key={order.id} to={`/order/${order.id}`} className="card block">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-ink">Замовлення #{order.id}</div>
                <span className={`px-2 py-1 rounded text-xs ${statusLabels[order.status]?.color || 'bg-gray-100'}`}>
                  {statusLabels[order.status]?.label || order.status}
                </span>
              </div>
              
              <div className="text-sm text-gray-500 mb-2">
                {new Date(order.created_at).toLocaleDateString('uk')}
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm">{order.items?.length || 0} товарів</span>
                <span className="font-bold">{order.total_amount} ₴</span>
              </div>
              
              {order.ttn_number && (
                <div className="mt-2 text-sm text-primary">
                  ТТН: {order.ttn_number}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
