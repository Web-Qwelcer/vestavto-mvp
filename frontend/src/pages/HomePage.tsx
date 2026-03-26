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

export default function HomePage() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || ''
  const car = params.get('car') || ''
  
  const addItem = useCartStore(s => s.addItem)

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', category, car],
    queryFn: async () => {
      const res = await api.get('/products', { 
        params: { category: category || undefined, car_model: car || undefined }
      })
      return res.data as Product[]
    }
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
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <select 
          value={category}
          onChange={(e) => setFilter('category', e.target.value)}
          className="px-3 py-2 rounded-lg border bg-white text-sm"
        >
          {categories.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        
        <select
          value={car}
          onChange={(e) => setFilter('car', e.target.value)}
          className="px-3 py-2 rounded-lg border bg-white text-sm"
        >
          {cars.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Products */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Завантаження...</div>
      ) : products?.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Товарів не знайдено</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {products?.map(product => (
            <div key={product.id} className="card">
              <Link to={`/product/${product.id}`}>
                <div className="aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden">
                  {product.photos?.[0] ? (
                    <img 
                      src={product.photos[0]} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      Фото
                    </div>
                  )}
                </div>
                <h3 className="font-medium text-sm line-clamp-2 mb-1">
                  {product.name}
                </h3>
              </Link>
              
              <div className="flex items-center justify-between mt-2">
                <div>
                  <div className="font-bold text-primary">{product.price} ₴</div>
                  {product.deposit > 0 && (
                    <div className="text-xs text-gray-500">
                      завдаток {product.deposit} ₴
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => addItem({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    deposit: product.deposit,
                    photo: product.photos?.[0]
                  })}
                  className="p-2 bg-primary text-white rounded-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
