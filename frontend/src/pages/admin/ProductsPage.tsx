import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api'
import { useAuthStore } from '../../store/auth'
import { Navigate } from 'react-router-dom'

interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: { row: number; error: string }[]
}

export default function AdminProductsPage() {
  const { isManager, isLoading: authLoading } = useAuthStore()
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addPhotoInputRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const uploadTargetId = useRef<number | null>(null)

  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    deposit: '',
    category: 'engine',
    car_model: 'superb_2_pre',
    photos: [] as string[],
    is_available: true,
  })

  // ALL hooks before conditional returns
  const { data: products, isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { available_only: false } })
      return res.data
    },
    enabled: isManager && !authLoading,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Помилка видалення товару')
    },
  })

  // Upload array of files to a product (sequentially)
  const uploadPhotos = async (productId: number, files: File[]) => {
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/products/${productId}/upload-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    }
  }

  // Single-click atomic save: create/update → upload pending photos
  const handleSave = async () => {
    if (isSaving || !form.name || !form.price) {
      if (!form.name) alert('Введіть назву товару')
      else if (!form.price) alert('Введіть ціну')
      return
    }
    setIsSaving(true)
    try {
      const data = {
        ...form,
        price: parseFloat(form.price),
        deposit: parseFloat(form.deposit) || 0,
      }
      let productId: number
      if (editId) {
        await api.put(`/products/${editId}`, data)
        productId = editId
      } else {
        const res = await api.post('/products', data)
        productId = res.data.id
      }
      if (pendingPhotos.length > 0) {
        await uploadPhotos(productId, pendingPhotos)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      resetForm()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Помилка збереження')
    } finally {
      setIsSaving(false)
    }
  }

  // Upload photos via thumbnail click (for existing products in list)
  const handleUploadClick = (productId: number) => {
    uploadTargetId.current = productId
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const id = uploadTargetId.current
    if (!files.length || !id) return
    e.target.value = ''
    setUploadingId(id)
    try {
      await uploadPhotos(id, files)
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Помилка завантаження')
    } finally {
      setUploadingId(null)
    }
  }

  const handleAddPendingPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length) setPendingPhotos((prev) => [...prev, ...files])
    e.target.value = ''
  }

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      price: '',
      deposit: '',
      category: 'engine',
      car_model: 'superb_2_pre',
      photos: [],
      is_available: true,
    })
    setEditId(null)
    setShowForm(false)
    setPendingPhotos([])
  }

  const editProduct = (p: any) => {
    setForm({
      name: p.name ?? '',
      description: p.description ?? '',
      price: String(p.price ?? ''),
      deposit: String(p.deposit ?? 0),
      category: p.category ?? 'engine',
      car_model: p.car_model ?? 'superb_2_pre',
      photos: Array.isArray(p.photos) ? p.photos : [],
      is_available: p.is_available ?? true,
    })
    setEditId(p.id)
    setShowForm(true)
    setPendingPhotos([])
  }

  const removeExistingPhoto = (index: number) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }))
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await api.get('/products/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'products.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Помилка експорту')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setIsImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/products/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportResult(res.data)
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Помилка імпорту')
    } finally {
      setIsImporting(false)
    }
  }

  // Conditional returns after hooks
  if (authLoading) return <div className="p-4 text-center text-ink">Завантаження...</div>
  if (!isManager) return <Navigate to="/" />

  return (
    <div className="p-4 text-ink">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl font-bold text-ink">Товари</h1>
        <div className="flex items-center gap-2">
          {/* Export */}
          <button
            onClick={handleExport}
            disabled={isExporting}
            title="Експорт в Excel"
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-ink bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {isExporting ? '...' : '📥 Експорт'}
          </button>

          {/* Import */}
          <button
            onClick={() => importFileRef.current?.click()}
            disabled={isImporting}
            title="Імпорт з Excel"
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-ink bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {isImporting ? '...' : '📤 Імпорт'}
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleImportFile}
          />

          {/* Add */}
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="btn-primary"
          >
            + Додати
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={`mb-3 p-3 rounded-xl border text-sm ${
          importResult.errors.length > 0
            ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
            : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          <div className="font-medium mb-1">
            Імпорт завершено: створено {importResult.created}, оновлено {importResult.updated},
            без змін {importResult.skipped}
            {importResult.errors.length > 0 && `, помилок ${importResult.errors.length}`}
          </div>
          {importResult.errors.map((e, i) => (
            <div key={i} className="text-xs">Рядок {e.row}: {e.error}</div>
          ))}
          <button
            onClick={() => setImportResult(null)}
            className="mt-1 text-xs underline opacity-70"
          >
            Закрити
          </button>
        </div>
      )}

      {showForm && (
        <div className="card mb-4 bg-white">
          <h2 className="font-semibold mb-3 text-ink">
            {editId ? 'Редагувати товар' : 'Новий товар'}
          </h2>
          <div className="space-y-3">
            <input
              placeholder="Назва *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded bg-white text-ink placeholder-gray-400"
            />
            <textarea
              placeholder="Опис"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded bg-white text-ink placeholder-gray-400"
              rows={3}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Ціна (грн) *"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="p-2 border border-gray-300 rounded bg-white text-ink placeholder-gray-400"
              />
              <input
                type="number"
                placeholder="Завдаток (грн)"
                value={form.deposit}
                onChange={(e) => setForm({ ...form, deposit: e.target.value })}
                className="p-2 border border-gray-300 rounded bg-white text-ink placeholder-gray-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="p-2 border border-gray-300 rounded bg-white text-ink"
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
                className="p-2 border border-gray-300 rounded bg-white text-ink"
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
            <label className="flex items-center gap-2 text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
              />
              В наявності
            </label>

            {/* Photo section */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Фото</p>
              <div className="flex flex-wrap gap-2">
                {/* Existing photos with ✕ delete */}
                {form.photos.map((url, i) => (
                  <div key={`ex-${i}`} className="relative w-16 h-16">
                    <img src={url} alt="" className="w-full h-full object-cover rounded-lg" />
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none shadow"
                      onClick={() => removeExistingPhoto(i)}
                      title="Видалити фото"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {/* Newly selected (pending) photos with ✕ */}
                {pendingPhotos.map((file, i) => (
                  <div key={`new-${i}`} className="relative w-16 h-16">
                    <img
                      src={URL.createObjectURL(file)}
                      alt=""
                      className="w-full h-full object-cover rounded-lg opacity-80"
                    />
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none shadow"
                      onClick={() => setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {/* Add photo button */}
                <button
                  type="button"
                  onClick={() => addPhotoInputRef.current?.click()}
                  className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-2xl hover:border-blue-400 hover:text-blue-400 transition-colors"
                >
                  +
                </button>
              </div>
              <input
                ref={addPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleAddPendingPhoto}
              />
              {pendingPhotos.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  + {pendingPhotos.length} нових фото — завантажаться автоматично
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary flex-1 disabled:opacity-60"
              >
                {isSaving
                  ? pendingPhotos.length > 0
                    ? 'Завантаження фото...'
                    : 'Збереження...'
                  : 'Зберегти'}
              </button>
              <button
                onClick={resetForm}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 rounded text-ink bg-white disabled:opacity-50"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for list-item thumbnail click */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Завантаження...</div>
      ) : (
        <div className="space-y-2">
          {(!products || products.length === 0) && (
            <p className="text-center text-gray-500 py-8">Товарів немає. Додайте перший!</p>
          )}
          {products?.map((p: any) => (
            <div key={p.id} className="card flex gap-3 items-center bg-white">
              {/* Thumbnail — click to upload photo */}
              <div
                className="w-14 h-14 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden cursor-pointer relative"
                onClick={() => handleUploadClick(p.id)}
                title="Натисни щоб завантажити фото"
              >
                {p.photos?.[0] ? (
                  <img src={p.photos[0]} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center leading-tight px-1">
                    + фото
                  </div>
                )}
                {uploadingId === p.id && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate text-ink">{p.name}</div>
                <div className="text-xs text-gray-500">
                  {p.price} ₴{p.deposit ? ` • завд. ${p.deposit} ₴` : ''} •{' '}
                  <span className={p.is_available ? 'text-green-600' : 'text-red-500'}>
                    {p.is_available ? '✓ є' : '✗ немає'}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 flex-shrink-0">
                <button onClick={() => editProduct(p)} className="text-blue-600 text-sm font-medium">
                  Ред.
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Видалити "${p.name}"?`)) deleteMutation.mutate(p.id)
                  }}
                  className="text-red-500 text-sm font-medium"
                >
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
