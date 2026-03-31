import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { useCartStore } from '../store/cart'

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'Двигун і навісне',
  transmission: 'Трансмісія',
  suspension: 'Ходова частина',
  body: 'Кузов і оптика',
  interior: 'Салон',
  electrical: 'Електрика',
  other: 'Інше',
}

const CAR_LABELS: Record<string, string> = {
  superb_2_pre: 'Superb 2 дорест',
  superb_2_rest: 'Superb 2 рест',
  passat_b7: 'Passat B7',
  cc: 'VW CC',
  touareg: 'Touareg',
  tiguan: 'Tiguan',
  other: 'Інше',
}

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const addItem = useCartStore((s) => s.addItem)
  const [photoIdx, setPhotoIdx] = useState(0)
  const touchStartX = useRef(0)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await api.get(`/products/${id}`)
      return res.data
    },
  })

  if (isLoading) return <div className="p-4 text-center text-ink">Завантаження...</div>
  if (!product) return <div className="p-4 text-center text-ink">Товар не знайдено</div>

  const photos: string[] = product.photos ?? []
  const hasMany = photos.length > 1

  const prev = () => setPhotoIdx((i) => Math.max(0, i - 1))
  const next = () => setPhotoIdx((i) => Math.min(photos.length - 1, i + 1))

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (delta > 50) next()
    else if (delta < -50) prev()
  }

  const handleAddToCart = () => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      deposit: product.deposit,
      photo: photos[0],
    })
    navigate('/cart')
  }

  const handleAskQuestion = () => {
    const managerUsername = import.meta.env.VITE_MANAGER_USERNAME
    if (!managerUsername) return
    const text = encodeURIComponent(`Питання по товару: ${product.name} (ID: ${product.id})`)
    const url = `https://t.me/${managerUsername}?text=${text}`
    const tg = window.Telegram?.WebApp
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url)
    } else {
      window.open(url, '_blank')
    }
  }

  const categoryLabel = CATEGORY_LABELS[product.category] ?? product.category
  const carLabel = CAR_LABELS[product.car_model] ?? product.car_model
  const isNegotiable: boolean = !!product.is_negotiable

  return (
    <div className="pb-52">
      {/* Photo carousel */}
      <div
        className="aspect-square bg-gray-100 relative overflow-hidden select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {photos.length > 0 ? (
          <img
            key={photoIdx}
            src={photos[photoIdx]}
            alt={product.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Half-zone tap areas */}
        {hasMany && (
          <>
            <button
              onClick={prev}
              disabled={photoIdx === 0}
              className="absolute inset-y-0 left-0 w-1/2"
              aria-label="Попереднє фото"
            />
            <button
              onClick={next}
              disabled={photoIdx === photos.length - 1}
              className="absolute inset-y-0 right-0 w-1/2"
              aria-label="Наступне фото"
            />
          </>
        )}

        {/* Arrows (visual hint, pointer-events-none so tap zones handle clicks) */}
        {hasMany && photoIdx > 0 && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center text-xl leading-none pointer-events-none">
            ‹
          </div>
        )}
        {hasMany && photoIdx < photos.length - 1 && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center text-xl leading-none pointer-events-none">
            ›
          </div>
        )}

        {/* Dot indicators */}
        {hasMany && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setPhotoIdx(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === photoIdx ? 'bg-white' : 'bg-white/45'
                }`}
              />
            ))}
          </div>
        )}

        {/* Counter badge */}
        {hasMany && (
          <div className="absolute top-3 right-3 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full">
            {photoIdx + 1} / {photos.length}
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="mx-4 mt-4 mb-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h1 className="text-xl font-bold mb-3 text-ink leading-snug">{product.name}</h1>

        {/* Price */}
        <div className="flex items-baseline gap-3 mb-4">
          {isNegotiable ? (
            <span className="text-2xl font-bold text-gray-500">Ціна договірна</span>
          ) : (
            <>
              <span className="text-3xl font-bold text-primary">{product.price} ₴</span>
              {product.deposit > 0 && (
                <span className="text-sm text-gray-400">завдаток {product.deposit} ₴</span>
              )}
            </>
          )}
        </div>

        {/* Description */}
        {product.description && (
          <div className="mb-4">
            <p className="text-gray-500 text-sm leading-relaxed">{product.description}</p>
          </div>
        )}

        {/* Meta tags */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {categoryLabel}
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {carLabel}
          </span>
        </div>
      </div>

      {/* Fixed bottom buttons */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-white border-t border-gray-100 space-y-2">
        {isNegotiable ? (
          <button onClick={handleAskQuestion} className="btn-primary w-full py-3">
            💬 Запитати ціну
          </button>
        ) : (
          <>
            {!product.is_available ? (
              <button disabled className="w-full py-3 rounded-xl font-medium bg-gray-200 text-gray-500 cursor-not-allowed">
                Продано
              </button>
            ) : (
              <button onClick={handleAddToCart} className="btn-primary w-full py-3">
                Додати в кошик
              </button>
            )}
            {import.meta.env.VITE_MANAGER_USERNAME && (
              <button
                onClick={handleAskQuestion}
                className="w-full py-3 rounded-xl font-medium border border-gray-300 bg-white text-ink hover:bg-gray-50 transition-colors"
              >
                💬 Запитати про товар
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
