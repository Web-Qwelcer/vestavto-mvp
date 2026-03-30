import { useState } from 'react'
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

  // ── Edit contact state ──
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ recipient_name: '', recipient_phone: '' })

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
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Помилка оновлення статусу')
    },
  })

  const createTTN = useMutation({
    mutationFn: (id: number) => api.post(`/delivery/${id}/create-ttn`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Помилка створення ТТН')
    },
  })

  const updateContact = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof editForm }) =>
      api.patch(`/orders/${id}/contact`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      setEditingId(null)
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Помилка збереження')
    },
  })

  // Conditional returns after hooks
  if (authLoading) return <div className="p-4 text-center text-ink">Завантаження...</div>
  if (!isManager) return <Navigate to="/" />

  const startEdit = (order: any) => {
    setEditForm({ recipient_name: order.recipient_name, recipient_phone: order.recipient_phone })
    setEditingId(order.id)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = (id: number) => {
    const name = editForm.recipient_name.trim()
    const phone = editForm.recipient_phone.trim()
    if (!name || !phone) return alert('Заповніть всі поля')
    updateContact.mutate({ id, data: { recipient_name: name, recipient_phone: phone } })
  }

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
          {orders.map((order: any) => {
            const isEditing = editingId === order.id
            const canEdit = !order.ttn_number

            return (
              <div key={order.id} className="card">
                {/* Header row: id + status */}
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

                {/* Contact info — view or edit */}
                <div className="text-sm mb-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editForm.recipient_name}
                        onChange={(e) => setEditForm(f => ({ ...f, recipient_name: e.target.value }))}
                        placeholder="Прізвище Ім'я По-батькові"
                        className="w-full p-2 border rounded-lg text-ink text-sm"
                        autoFocus
                      />
                      <input
                        type="tel"
                        value={editForm.recipient_phone}
                        onChange={(e) => setEditForm(f => ({ ...f, recipient_phone: e.target.value }))}
                        placeholder="0671234567"
                        className="w-full p-2 border rounded-lg text-ink text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(order.id)}
                          disabled={updateContact.isPending}
                          className="flex-1 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          {updateContact.isPending ? 'Збереження...' : '💾 Зберегти'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={updateContact.isPending}
                          className="flex-1 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
                        >
                          ✕ Скасувати
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-ink">
                          {order.recipient_name} • {order.recipient_phone}
                        </div>
                        <div className="text-gray-500">{order.np_warehouse_name}</div>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => startEdit(order)}
                          title="Редагувати контакт"
                          className="text-gray-400 hover:text-primary text-base leading-none flex-shrink-0 mt-0.5"
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Amount + TTN row */}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
