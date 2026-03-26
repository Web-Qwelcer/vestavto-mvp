import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api'
import { useAuthStore } from '../../store/auth'
import { Navigate } from 'react-router-dom'

export default function AdminProductsPage() {
  const { isManager } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    deposit: '',
    category: 'engine',
    car_model: 'superb_2_pre',
    photos: [] as string[],
    is_available: true
  })

  if (!isManager) return <Navigate to="/" />

  const { data: products, isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { available_only: false } })
      return res.data
    }
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        ...form,
        price: parseFloat(form.price),
        deposit: parseFloat(form.deposit) || 0
      }
      if (editId) {
        return api.put(`/products/${editId}`, data)
      }
      return api.post('/products', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      resetForm()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] })
  })

  const resetForm = () => {
    setForm({ name: '', description: '', price: '', deposit: '', category: 'engine', car_model: 'superb_2_pre', photos: [], is_available: true })
    setEditId(null)
    setShowForm(false)
  }

  const editProduct = (p: any) => {
    setForm({
      name: p.name,
      description: p.description || '',
      price: String(p.price),
      deposit: String(p.deposit || 0),
      category: p.category,
      car_model: p.car_model,
      photos: p.photos || [],
      is_available: p.is_available
    })
    setEditId(p.id)
    setShowForm(true)
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Товари</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Додати
        </button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <h2 className="font-medium mb-3">{editId ? 'Редагувати' : 'Новий товар'}</h2>
          <div className="space-y-3">
            <input
              placeholder="Назва"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full p-2 border rounded"
            />
            <textarea
              placeholder="Опис"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 border rounded"
              rows={3}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Ціна"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="p-2 border rounded"
              />
              <input
                type="number"
                placeholder="Завдаток"
                value={form.deposit}
                onChange={(e) => setForm({ ...form, deposit: e.target.value })}
                className="p-2 border rounded"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="p-2 border rounded"
              >
                <option value="engine">Двигун</option>
                <option value="transmission">Трансмісія</option>
                <option value="suspension">Ходова</option>
                <option value="body">Кузов</option>
                <option value="interior">Салон</option>
                <option value="electrical">Електрика</option>
                <option value="other">Інше</option>
              </select>
              <select
                value={form.car_model}
                onChange={(e) => setForm({ ...form, car_model: e.target.value })}
                className="p-2 border rounded"
              >
                <option value="superb_2_pre">Superb 2 дорест</option>
                <option value="superb_2_rest">Superb 2 рест</option>
                <option value="passat_b7">Passat B7</option>
                <option value="cc">VW CC</option>
                <option value="touareg">Touareg</option>
                <option value="tiguan">Tiguan</option>
                <option value="other">Інше</option>
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
              />
              В наявності
            </label>
            <div className="flex gap-2">
              <button onClick={() => saveMutation.mutate()} className="btn-primary flex-1">
                Зберегти
              </button>
              <button onClick={resetForm} className="px-4 py-2 border rounded">
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8">Завантаження...</div>
      ) : (
        <div className="space-y-2">
          {products?.map((p: any) => (
            <div key={p.id} className="card flex justify-between items-center">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-gray-500">{p.price} ₴ • {p.is_available ? '✓ є' : '✗ немає'}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => editProduct(p)} className="text-primary text-sm">
                  Ред.
                </button>
                <button onClick={() => deleteMutation.mutate(p.id)} className="text-red-500 text-sm">
                  Вид.
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
