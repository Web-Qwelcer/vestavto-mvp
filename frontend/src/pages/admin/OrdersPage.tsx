import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import api from '../../api'
import { useAuthStore } from '../../store/auth'

const statuses = [
  'new',
  'pending_payment',
  'deposit_paid',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]

const statusLabels: Record<string, string> = {
  new: 'Новий',
  pending_payment: 'Очікує оплати',
  deposit_paid: 'Завдаток сплачено',
  paid: 'Оплачено',
  processing: 'Обробляється',
  shipped: 'Відправлено',
  delivered: 'Доставлено',
  cancelled: 'Скасовано',
}

export default function AdminOrdersPage() {
  const { isManager, isLoading: authLoading } = useAuthStore()
  const queryClient = useQueryClient()

  // ALL hooks before conditional returns
  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const res = await api.get('/orders')
      return res.data
    },
    enabled: isManager && !authLoading,
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
  })

  const createTTN = useMutation({
    mutationFn: (id: number) => api.post(`/delivery/${id}/create-ttn`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
  })

  // Conditional returns after hooks
  if (authLoading) return <div className="p-4 text-center text-ink">Завантаження...</div>
  if (!isManager) return <Navigate to="/" />

  return (
    <div className="p-4 text-ink">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-ink">Замовлення</h1>
        <Link to="/admin/products" className="text-primary text-sm font-medium">
          Товари →
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Завантаження...</div>
      ) : !orders?.length ? (
        <div className="text-center py-8 text-gray-500">Замовлень немає</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any) => (
            <div key={order.id} className="card">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold text-ink">#{order.id}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleString('uk')}
                  </div>
                </div>
                <select
                  value={order.status}
                  onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value })}
                  className="text-sm border border-gray-300 rounded p-1 bg-white text-ink"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-sm mb-2 text-ink">
                <div className="font-medium">
                  {order.recipient_name} • {order.recipient_phone}
                </div>
                <div className="text-gray-500">{order.np_warehouse_name}</div>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-ink">
                  {order.total_amount} ₴{' '}
                  <span className="text-gray-500">(сплачено: {order.paid_amount} ₴)</span>
                </span>
                {order.ttn_number ? (
                  <span className="text-primary font-medium">ТТН: {order.ttn_number}</span>
                ) : order.status === 'paid' || order.status === 'deposit_paid' ? (
                  <button
                    onClick={() => createTTN.mutate(order.id)}
                    disabled={createTTN.isPending}
                    className="text-primary font-medium disabled:opacity-50"
                  >
                    {createTTN.isPending ? 'Створення...' : 'Створити ТТН'}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
