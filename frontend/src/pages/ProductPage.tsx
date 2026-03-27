import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { useCartStore } from '../store/cart'

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

  return (
    <div className="pb-24">
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
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            Фото відсутнє
          </div>
        )}

        {/* Arrows */}
        {hasMany && photoIdx > 0 && (
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center text-xl leading-none hover:bg-black/60 transition-colors"
          >
            ‹
          </button>
        )}
        {hasMany && photoIdx < photos.length - 1 && (
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center text-xl leading-none hover:bg-black/60 transition-colors"
          >
            ›
          </button>
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

      {/* Info */}
      <div className="p-4">
        <h1 className="text-xl font-bold mb-2 text-ink">{product.name}</h1>

        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-2xl font-bold text-primary">{product.price} ₴</span>
          {product.deposit > 0 && (
            <span className="text-sm text-gray-500">завдаток {product.deposit} ₴</span>
          )}
        </div>

        {product.description && (
          <div className="mb-4">
            <h3 className="font-medium mb-1 text-ink">Опис</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{product.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-50 p-2 rounded">
            <span className="text-gray-500">Категорія:</span>
            <div className="font-medium text-ink">{product.category}</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <span className="text-gray-500">Авто:</span>
            <div className="font-medium text-ink">{product.car_model}</div>
          </div>
        </div>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <button onClick={handleAddToCart} className="btn-primary w-full py-3">
          Додати в кошик
        </button>
      </div>
    </div>
  )
}
