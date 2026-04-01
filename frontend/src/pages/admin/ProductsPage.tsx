import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api'
import { useAuthStore } from '../../store/auth'
import { Navigate } from 'react-router-dom'
import { useToastStore } from '../../store/toast'

interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: { row: number; error: string }[]
}

export default function AdminProductsPage() {
  const { isManager, isLoading: authLoading, botMode } = useAuthStore()
  const queryClient = useQueryClient()
  const { showToast } = useToastStore()

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
  const [activeTab, setActiveTab] = useState<'available' | 'reserved' | 'sold'>('available')

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
    is_reserved: false,
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
      showToast(err?.response?.data?.detail || 'Помилка видалення товару', 'error')
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
    if (isSaving) return
    if (!form.name) { showToast('Введіть назву товару', 'error'); return }
    if (!form.is_negotiable && !(parseFloat(form.price) > 0)) {
      showToast('Введіть ціну більше 0 або позначте "Договірна ціна"', 'error')
      return
    }
    setIsSaving(true)
    try {
      const price   = form.is_negotiable ? 0 : parseFloat(form.price)
      const deposit = form.is_negotiable ? 0 : (parseFloat(form.deposit) || 0)
      const data = { ...form, price, deposit }
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
      showToast(editId ? 'Товар збережено' : 'Товар додано', 'success')
      resetForm()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: any) => e?.msg ?? JSON.stringify(e)).join('; ')
          : detail
            ? JSON.stringify(detail)
            : 'Помилка збереження'
      showToast(msg, 'error')
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
      showToast(err?.response?.data?.detail || 'Помилка завантаження', 'error')
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
      is_reserved: false,
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
      is_reserved: p.is_reserved ?? false,
      is_negotiable: p.is_negotiable ?? false,
    })
    setEditId(p.id)
    setShowForm(true)
    setPendingPhotos([])
  }

  const getStatusValue = () => {
    if (!form.is_available) return 'sold'
    if (form.is_reserved) return 'reserved'
    return 'available'
  }

  const handleStatusChange = (status: string) => {
    if (status === 'available') setForm((f) => ({ ...f, is_available: true, is_reserved: false }))
    else if (status === 'reserved') setForm((f) => ({ ...f, is_available: true, is_reserved: true }))
    else setForm((f) => ({ ...f, is_available: false, is_reserved: false }))
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
      showToast(err?.response?.data?.detail || 'Помилка імпорту', 'error')
    } finally {
      setIsImporting(false)
    }
  }

  // Tab filtering
  const tabProducts = useMemo(() => {
    if (!products) return []
    if (activeTab === 'available') return (products as any[]).filter((p: any) => p.is_available && !p.is_reserved)
    if (activeTab === 'reserved') return (products as any[]).filter((p: any) => p.is_available && p.is_reserved)
    return (products as any[]).filter((p: any) => !p.is_available)
  }, [products, activeTab])

  // Badge counts per tab (from all products, not search-filtered)
  const tabCounts = useMemo(() => {
    if (!products) return { available: 0, reserved: 0, sold: 0 }
    return {
      available: (products as any[]).filter((p: any) => p.is_available && !p.is_reserved).length,
      reserved: (products as any[]).filter((p: any) => p.is_available && p.is_reserved).length,
      sold: (products as any[]).filter((p: any) => !p.is_available).length,
    }
  }, [products])

  // Search across ALL products (ignores active tab); empty query → use tab filter
  // Numeric query → exact ID match only; text → name/description, sorted by relevance
  const searchProducts = (list: any[], query: string) => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const rawQ = q.replace('#', '')
    const isNumeric = /^\d+$/.test(rawQ)
    if (isNumeric) {
      return list.filter((p: any) => String(p.id) === rawQ)
    }
    return list
      .map((p: any) => {
        const nameMatch = p.name?.toLowerCase().includes(q)
        const descMatch = (p.description ?? '').toLowerCase().includes(q)
        if (!nameMatch && !descMatch) return null
        return { p, score: nameMatch ? 0 : 1 }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.score - b.score)
      .map((x: any) => x.p)
  }

  const filteredProducts = useMemo(() => {
    const result = searchProducts(products as any[] ?? [], searchQuery)
    return result ?? tabProducts
  }, [products, tabProducts, searchQuery])

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return []
    const result = searchProducts(products as any[] ?? [], searchQuery)
    return (result ?? []).slice(0, 5)
  }, [products, searchQuery])

  const openSearch = () => {
    setShowSearch(true)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  const closeSearch = () => {
    setShowSearch(false)
    setSearchQuery('')
    setShowDropdown(false)
  }

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

  return (
    <div className="p-4 text-ink">
      <h1 className="text-xl font-bold text-ink mb-3">Товари</h1>
      {/* Row 1: actions */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={handleExport}
          title="Експорт в Excel"
          className="flex-1 h-9 border border-gray-300 rounded-lg text-xs text-ink bg-white hover:bg-gray-50"
        >
          📥 Експорт
        </button>
        <button
          onClick={() => importFileRef.current?.click()}
          disabled={isImporting}
          title="Імпорт з Excel"
          className="flex-1 h-9 border border-gray-300 rounded-lg text-xs text-ink bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {isImporting ? '...' : '📤 Імпорт'}
        </button>
        <input ref={importFileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex-1 h-9 rounded-lg text-xs font-medium bg-primary text-white hover:bg-blue-700"
        >
          + Додати
        </button>
      </div>

      {/* Row 2: tabs + search */}
      <div className="flex items-center gap-2 mb-4">
        {!showSearch ? (
          <>
            {(['available', 'reserved', 'sold'] as const).map((tab) => {
              const icons = { available: '✓', reserved: '🔒', sold: '✕' }
              const titles = { available: 'В наявності', reserved: 'Заброньовані', sold: 'Продані' }
              const count = tabCounts[tab]
              const isActive = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  title={titles[tab]}
                  className={`flex-1 h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${
                    isActive ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className="leading-none">{icons[tab]}</span>
                  <span className="text-xs">{count}</span>
                </button>
              )
            })}
            <button
              onClick={openSearch}
              className="ml-auto w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg bg-white text-gray-500 hover:text-primary flex-shrink-0"
              aria-label="Пошук"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </button>
          </>
        ) : (
          <div className="relative flex items-center gap-2 w-full">
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
                      <div className="flex-1 min-w-0 flex items-center gap-1">
                        <span className="text-gray-400 text-xs flex-shrink-0">#{p.id}</span>
                        <span className="text-sm text-ink truncate">{p.name}</span>
                      </div>
                      <span className="text-xs text-primary flex-shrink-0 ml-2">{p.price} ₴</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={closeSearch}
              className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg bg-white text-gray-500 hover:text-ink flex-shrink-0 leading-none"
              aria-label="Закрити пошук"
            >
              ✕
            </button>
          </div>
        )}
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
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto">
          {/* Modal header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
            <h2 className="font-semibold text-ink">
              {editId ? 'Редагувати товар' : 'Новий товар'}
            </h2>
            <button
              onClick={resetForm}
              disabled={isSaving}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-ink text-lg disabled:opacity-50"
              aria-label="Закрити"
            >
              ✕
            </button>
          </div>
          <div className="p-4 space-y-3 flex-1">
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
                onChange={(e) => {
                  const checked = e.target.checked
                  if (!checked) {
                    const reserve = confirm('Забронювати товар для клієнта?')
                    setForm((f) => ({
                      ...f,
                      is_negotiable: false,
                      price: '',
                      deposit: '',
                      is_available: true,
                      is_reserved: reserve,
                    }))
                  } else {
                    setForm((f) => ({ ...f, is_negotiable: true, price: '', deposit: '' }))
                  }
                }}
              />
              Договірна ціна
            </label>
            {!form.is_negotiable && (
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
            )}
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
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Статус товару</label>
              <select
                value={getStatusValue()}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-ink"
              >
                <option value="available">В наявності</option>
                <option value="reserved">Заброньовано</option>
                <option value="sold">Продано</option>
              </select>
            </div>

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

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary w-full py-3 disabled:opacity-60"
            >
              {isSaving
                ? pendingPhotos.length > 0
                  ? 'Завантаження фото...'
                  : 'Збереження...'
                : 'Зберегти'}
            </button>
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
                  {!p.is_available
                    ? <span className="text-red-500">Продано</span>
                    : p.is_reserved
                      ? <span className="text-orange-500">Заброньовано</span>
                      : <span className="text-green-600">В наявності</span>
                  }
                </div>
              </div>

              <div className="flex gap-3 flex-shrink-0">
                <button
                  onClick={() => {
                    const botUsername = import.meta.env.VITE_BOT_USERNAME || 'vestavto_client_bot'
                    const url = `https://t.me/${botUsername}/shop?startapp=product_${p.id}`
                    navigator.clipboard.writeText(url).then(
                      () => showToast('Посилання скопійовано!', 'success'),
                      () => showToast('Не вдалося скопіювати', 'error')
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
