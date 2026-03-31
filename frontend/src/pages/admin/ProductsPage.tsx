import { useState, useRef, useMemo } from 'react'
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
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addPhotoInputRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
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
    is_negotiable: false,
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
    if (isSaving || !form.name || (!form.price && !form.is_negotiable)) {
      if (!form.name) alert('Введіть назву товару')
      else if (!form.price && !form.is_negotiable) alert('Введіть ціну або позначте "Договірна ціна"')
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
      is_negotiable: false,
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
      is_negotiable: p.is_negotiable ?? false,
    })
    setEditId(p.id)
    setShowForm(true)
    setPendingPhotos([])
  }

  const removeExistingPhoto = (index: number) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }))
  }

  const handleExport = () => {
    // Pass JWT as query param so the browser navigates directly to the file URL.
    // This works on all platforms including iOS Safari / Telegram WebView
    // (which ignores <a download> and blob URL workarounds).
    const token = useAuthStore.getState().token
    const base = (api.defaults.baseURL ?? '').replace(/\/$/, '')
    window.open(`${base}/products/export?token=${token}`, '_blank')
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

  // Admin search: filter by ID, name, description
  const filteredProducts = useMemo(() => {
    if (!products) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter((p: any) =>
      String(p.id) === q.replace('#', '') ||
      p.name?.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q)
    )
  }, [products, searchQuery])

  const suggestions = useMemo(() => {
    if (!products || !searchQuery.trim()) return []
    const q = searchQuery.trim().toLowerCase()
    return (products as any[])
      .filter((p: any) =>
        String(p.id) === q.replace('#', '') ||
        p.name?.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      )
      .slice(0, 5)
  }, [products, searchQuery])

  const closeSearch = () => {
    setShowSearch(false)
    setSearchQuery('')
    setShowDropdown(false)
  }

  // Conditional returns after hooks
  if (authLoading) return <div className="p-4 text-center text-ink">Завантаження...</div>
  if (!isManager) return <Navigate to="/" />

  return (
    <div className="p-4 text-ink">
      <h1 className="text-xl font-bold text-ink mb-3">Товари</h1>
      <div className="flex items-center gap-2 mb-4">
          {/* Export */}
          <button
            onClick={handleExport}
            title="Експорт в Excel"
            className="flex-1 h-9 border border-gray-300 rounded-lg text-xs text-ink bg-white hover:bg-gray-50"
          >
            📥 Експорт
          </button>

          {/* Import */}
          <button
            onClick={() => importFileRef.current?.click()}
            disabled={isImporting}
            title="Імпорт з Excel"
            className="flex-1 h-9 border border-gray-300 rounded-lg text-xs text-ink bg-white hover:bg-gray-50 disabled:opacity-50"
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
            className="flex-1 h-9 rounded-lg text-xs font-medium bg-primary text-white hover:bg-blue-700"
          >
            + Додати
          </button>

          {/* Search toggle */}
          <button
            onClick={() => {
              setShowSearch(true)
              requestAnimationFrame(() => searchInputRef.current?.focus())
            }}
            className="flex-1 h-9 flex items-center justify-center border border-gray-300 rounded-lg bg-white text-gray-500 hover:text-primary"
            title="Пошук"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>
      </div>

      {/* Search bar (expands below button row) */}
      {showSearch && (
        <div className="relative mb-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="#ID або назва товару..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-ink"
                autoFocus
              />
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {suggestions.map((p: any) => (
                    <button
                      key={p.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeSearch(); editProduct(p) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {p.photos?.[0]
                          ? <img src={p.photos[0]} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">?</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-400 text-xs">#{p.id}</span>
                        <span className="text-sm text-ink ml-1 truncate">{p.name}</span>
                      </div>
                      <span className="text-xs text-primary flex-shrink-0">{p.price} ₴</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={closeSearch}
              className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg bg-white text-gray-500 hover:text-ink text-base flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
            <label className="flex items-center gap-2 text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_negotiable}
                onChange={(e) => setForm({ ...form, is_negotiable: e.target.checked })}
              />
              Договірна ціна
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder={form.is_negotiable ? 'Ціна (необов`язково)' : 'Ціна (грн) *'}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className={`p-2 border rounded bg-white text-ink placeholder-gray-400 ${form.is_negotiable ? 'border-gray-200 opacity-60' : 'border-gray-300'}`}
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
          {filteredProducts.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              {searchQuery.trim() ? 'Нічого не знайдено' : 'Товарів немає. Додайте перший!'}
            </p>
          )}
          {filteredProducts.map((p: any) => (
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
                <div className="font-medium text-sm truncate text-ink">
                  <span className="text-gray-400 font-normal">#{p.id} •</span> {p.name}
                </div>
                <div className="text-xs text-gray-500">
                  {p.is_negotiable
                    ? <span className="text-gray-400 italic">Договірна</span>
                    : <>{p.price} ₴{p.deposit ? ` • завд. ${p.deposit} ₴` : ''}</>
                  }{' '}•{' '}
                  <span className={p.is_available ? 'text-green-600' : 'text-red-500'}>
                    {p.is_available ? '✓ є' : '✗ немає'}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 flex-shrink-0">
                <button
                  onClick={() => {
                    const botUsername = import.meta.env.VITE_BOT_USERNAME || 'vestavto_client_bot'
                    const url = `https://t.me/${botUsername}/shop?startapp=product_${p.id}`
                    navigator.clipboard.writeText(url).then(
                      () => alert('Посилання скопійовано!'),
                      () => alert(url)
                    )
                  }}
                  className="text-gray-400 hover:text-primary text-sm"
                  title="Копіювати посилання"
                >
                  🔗
                </button>
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
