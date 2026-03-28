import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api'
import { useCartStore } from '../store/cart'

interface Product {
  id: number
  name: string
  price: number
  deposit: number
  category: string
  car_model: string
  photos: string[]
  is_available: boolean
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
  const category = params.get('category') || ''
  const car = params.get('car') || ''

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

  const setFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(params)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    setParams(newParams)
  }

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        <select
          value={category}
          onChange={(e) => setFilter('category', e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-ink text-sm flex-shrink-0"
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={car}
          onChange={(e) => setFilter('car', e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-ink text-sm flex-shrink-0"
        >
          {cars.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Products */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Завантаження...</div>
      ) : isError ? (
        <div className="text-center py-12 text-gray-400">Не вдалося завантажити товари</div>
      ) : products?.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Товарів не знайдено</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {products?.map((product) => (
            <div key={product.id} className="card flex flex-col p-0 overflow-hidden">
              {/* Photo */}
              <Link to={`/product/${product.id}`} className="block">
                <div className="aspect-square overflow-hidden">
                  {product.photos?.[0] ? (
                    <img
                      src={product.photos[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <PhotoPlaceholder />
                  )}
                </div>
              </Link>

              {/* Info */}
              <div className="p-3 flex flex-col flex-1">
                <Link to={`/product/${product.id}`} className="block mb-2">
                  <h3 className="font-medium text-sm text-ink line-clamp-2 leading-snug">
                    {product.name}
                  </h3>
                </Link>

                <div className="flex items-end justify-between mt-auto">
                  <div>
                    <div className="font-bold text-base text-primary leading-tight">
                      {product.price} ₴
                    </div>
                    {product.deposit > 0 && (
                      <div className="text-xs text-gray-400 leading-tight">
                        завд. {product.deposit} ₴
                      </div>
                    )}
                  </div>

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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
