import { useState, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { useCartStore } from '../store/cart'

interface Product {
  id: number
  name: string
  description?: string
  price: number
  deposit: number
  category: string
  car_model: string
  photos: string[]
  is_available: boolean
  is_negotiable: boolean
}

const categories = [
  { value: '', label: 'Всі' },
  { value: 'engine', label: 'Двигун' },
  { value: 'transmission', label: 'Трансмісія' },
  { value: 'suspension', label: 'Ходова' },
  { value: 'body', label: 'Кузов' },
  { value: 'interior', label: 'Салон' },
  { value: 'electrical', label: 'Електрика' },
]

const cars = [
  { value: '', label: 'Всі авто' },
  { value: 'superb_2_pre', label: 'Superb 2 дорест' },
  { value: 'superb_2_rest', label: 'Superb 2 рест' },
  { value: 'passat_b7', label: 'Passat B7' },
  { value: 'cc', label: 'VW CC' },
  { value: 'touareg', label: 'Touareg' },
  { value: 'tiguan', label: 'Tiguan' },
]

function PhotoPlaceholder() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-300">
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  )
}

export default function HomePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const category = params.get('category') || ''
  const car = params.get('car') || ''

  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const addItem = useCartStore((s) => s.addItem)

  const { data: products, isLoading, isError } = useQuery({
    queryKey: ['products', category, car],
    queryFn: async () => {
      const res = await api.get('/products', {
        params: { category: category || undefined, car_model: car || undefined },
      })
      return res.data as Product[]
    },
  })

  // Grid: filter by search query
  const filteredProducts = useMemo(() => {
    if (!products) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
    )
  }, [products, searchQuery])

  // Autocomplete: top-5 by name match
  const suggestions = useMemo(() => {
    if (!products || !searchQuery.trim()) return []
    const q = searchQuery.trim().toLowerCase()
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 5)
  }, [products, searchQuery])

  const handleAskAbout = (id: number, name: string) => () => {
    const managerUsername = import.meta.env.VITE_MANAGER_USERNAME
    if (!managerUsername) return
    const text = encodeURIComponent(`Питання по товару: ${name} (ID: ${id})`)
    const url = `https://t.me/${managerUsername}?text=${text}`
    const tg = window.Telegram?.WebApp
    if (tg?.openTelegramLink) tg.openTelegramLink(url)
    else window.open(url, '_blank')
  }

  const setFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(params)
    if (value) newParams.set(key, value)
    else newParams.delete(key)
    setParams(newParams)
  }

  const openSearch = () => {
    setShowSearch(true)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  const closeSearch = () => {
    setShowSearch(false)
    setSearchQuery('')
    setShowDropdown(false)
  }

  const handleSuggestionClick = (id: number) => {
    setShowDropdown(false)
    navigate(`/product/${id}`)
  }

  return (
    <div className="p-4">
      {/* ── Filters + Search row ── */}
      <div className="flex gap-2 mb-5 items-center">
        {!showSearch ? (
          <>
            {/* Category filter */}
            <select
              value={category}
              onChange={(e) => setFilter('category', e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-ink text-sm flex-shrink-0"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            {/* Car filter */}
            <select
              value={car}
              onChange={(e) => setFilter('car', e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-ink text-sm flex-shrink-0"
            >
              {cars.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            {/* Search icon — right side */}
            <button
              onClick={openSearch}
              className="ml-auto w-9 h-9 flex items-center justify-center text-gray-500 hover:text-primary rounded-xl border border-gray-300 bg-white flex-shrink-0"
              aria-label="Пошук"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </button>
          </>
        ) : (
          /* Search bar — replaces filters, full width */
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
                placeholder="Пошук по назві або опису..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm bg-white"
                autoFocus
              />

              {/* Autocomplete dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {suggestions.map((p) => (
                    <button
                      key={p.id}
                      onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                      onClick={() => handleSuggestionClick(p.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      {/* Thumbnail */}
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {p.photos?.[0]
                          ? <img src={p.photos[0]} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">?</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink truncate">{p.name}</div>
                        <div className="text-xs text-primary font-medium">{p.price} ₴</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Close search */}
            <button
              onClick={closeSearch}
              className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-ink rounded-xl border border-gray-300 bg-white flex-shrink-0 leading-none"
              aria-label="Закрити пошук"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── Products grid ── */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Завантаження...</div>
      ) : isError ? (
        <div className="text-center py-12 text-gray-400">Не вдалося завантажити товари</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {searchQuery.trim() ? 'Нічого не знайдено' : 'Товарів не знайдено'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((product) => (
            <div key={product.id} className="card flex flex-col p-0 overflow-hidden">
              <Link to={`/product/${product.id}`} className="block">
                <div className="aspect-square overflow-hidden">
                  {product.photos?.[0] ? (
                    <img src={product.photos[0]} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <PhotoPlaceholder />
                  )}
                </div>
              </Link>

              <div className="p-3 flex flex-col flex-1">
                <Link to={`/product/${product.id}`} className="block mb-2">
                  <h3 className="font-medium text-sm text-ink line-clamp-2 leading-snug">
                    {product.name}
                  </h3>
                </Link>

                <div className="flex items-end justify-between mt-auto">
                  <div>
                    {product.is_negotiable ? (
                      <div className="text-sm font-medium text-gray-500 leading-tight">Ціна договірна</div>
                    ) : (
                      <>
                        <div className="font-bold text-base text-primary leading-tight">
                          {product.price} ₴
                        </div>
                        {product.deposit > 0 && (
                          <div className="text-xs text-gray-400 leading-tight">
                            завд. {product.deposit} ₴
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {product.is_negotiable ? (
                    <button
                      onClick={handleAskAbout(product.id, product.name)}
                      className="p-2 bg-gray-100 text-gray-600 rounded-xl flex-shrink-0 text-base leading-none"
                      title="Запитати ціну"
                    >
                      💬
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        addItem({
                          id: product.id,
                          name: product.name,
                          price: product.price,
                          deposit: product.deposit,
                          photo: product.photos?.[0],
                        })
                      }
                      className="p-2 bg-primary text-white rounded-xl flex-shrink-0"
                      title="Додати в кошик"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
