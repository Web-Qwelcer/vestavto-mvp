import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import api from '../../api'
import { useAuthStore } from '../../store/auth'
import { useToastStore } from '../../store/toast'

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
  const { isManager, isLoading: authLoading, botMode } = useAuthStore()
  const queryClient = useQueryClient()
  const { showToast } = useToastStore()

  // ── Edit contact state ──
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ recipient_name: '', recipient_phone: '' })
  const [expandedId, setExpandedId] = useState<number | null>(null)

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      showToast('Статус оновлено', 'success')
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Помилка оновлення статусу', 'error')
    },
  })

  const createTTN = useMutation({
    mutationFn: (id: number) => api.post(`/delivery/${id}/create-ttn`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      showToast('ТТН створено', 'success')
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Помилка створення ТТН', 'error')
    },
  })

  const updateContact = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof editForm }) =>
      api.patch(`/orders/${id}/contact`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      showToast('Контакт збережено', 'success')
      setEditingId(null)
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Помилка збереження', 'error')
    },
  })

  // Conditional returns after hooks
  if (authLoading) return <div className="p-4 text-center text-ink">Завантаження...</div>
  if (!isManager) {
    if (botMode === 'manager') return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">🚫</div>
          <p className="text-lg font-semibold text-ink mb-1">Доступ заборонено</p>
          <p className="text-sm text-gray-500">Цей бот тільки для менеджерів</p>
        </div>
      </div>
    )
    return <Navigate to="/" />
  }

  const startEdit = (order: any) => {
    setEditForm({ recipient_name: order.recipient_name, recipient_phone: order.recipient_phone })
    setEditingId(order.id)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = (id: number) => {
    const name = editForm.recipient_name.trim()
    const phone = editForm.recipient_phone.trim()
    if (!name || !phone) { showToast('Заповніть всі поля', 'error'); return }
    updateContact.mutate({ id, data: { recipient_name: name, recipient_phone: phone } })
  }

  return (
    <div className="p-4 text-ink">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">Замовлення</h1>
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

            const isExpanded = expandedId === order.id
            const toggleExpand = () => setExpandedId(isExpanded ? null : order.id)

            return (
              <div key={order.id} className="card">
                {/* Header row: id + status */}
                <div className="flex justify-between items-start mb-2">
                  <button
                    onClick={toggleExpand}
                    className="text-left flex-1 min-w-0 mr-2"
                  >
                    <div className="font-bold text-ink">
                      #{order.id}
                      {order.items?.length > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-gray-400">
                          {order.items.length} поз. {isExpanded ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleString('uk')}
                    </div>
                  </button>
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

                {/* Expanded items list */}
                {isExpanded && order.items?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="space-y-1.5">
                      {order.items.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-baseline text-xs">
                          <span className="text-ink flex-1 min-w-0 truncate pr-2">
                            <span className="text-gray-400">#{item.product_id} •</span>{' '}
                            {item.product_name}
                            <span className="text-gray-400"> ×{item.quantity}</span>
                          </span>
                          <span className="text-gray-600 flex-shrink-0">{item.price * item.quantity} ₴</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
