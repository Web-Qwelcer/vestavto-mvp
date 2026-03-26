import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import api from '../../api'
import { useAuthStore } from '../../store/auth'

const statuses = ['new', 'pending_payment', 'deposit_paid', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']

export default function AdminOrdersPage() {
  const { isManager } = useAuthStore()
  const queryClient = useQueryClient()

  if (!isManager) return <Navigate to="/" />

  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const res = await api.get('/orders')
      return res.data
    }
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
  })

  const createTTN = useMutation({
    mutationFn: (id: number) => api.post(`/delivery/${id}/create-ttn`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
  })

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Замовлення</h1>
        <Link to="/admin/products" className="text-primary text-sm">Товари →</Link>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Завантаження...</div>
      ) : (
        <div className="space-y-3">
          {orders?.map((order: any) => (
            <div key={order.id} className="card">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold">#{order.id}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleString('uk')}
                  </div>
                </div>
                <select
                  value={order.status}
                  onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value })}
                  className="text-sm border rounded p-1"
                >
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="text-sm mb-2">
                <div>{order.recipient_name} • {order.recipient_phone}</div>
                <div className="text-gray-500">{order.np_warehouse_name}</div>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span>{order.total_amount} ₴ (сплачено: {order.paid_amount} ₴)</span>
                {order.ttn_number ? (
                  <span className="text-primary">ТТН: {order.ttn_number}</span>
                ) : order.status === 'paid' ? (
                  <button
                    onClick={() => createTTN.mutate(order.id)}
                    className="text-primary"
                  >
                    Створити ТТН
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
