import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { useCartStore } from '../store/cart'

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const addItem = useCartStore(s => s.addItem)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await api.get(`/products/${id}`)
      return res.data
    }
  })

  if (isLoading) return <div className="p-4 text-center">Завантаження...</div>
  if (!product) return <div className="p-4 text-center">Товар не знайдено</div>

  const handleAddToCart = () => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      deposit: product.deposit,
      photo: product.photos?.[0]
    })
    navigate('/cart')
  }

  return (
    <div className="pb-24">
      {/* Photos */}
      <div className="aspect-square bg-gray-100">
        {product.photos?.[0] ? (
          <img src={product.photos[0]} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">Фото</div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h1 className="text-xl font-bold mb-2">{product.name}</h1>
        
        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-2xl font-bold text-primary">{product.price} ₴</span>
          {product.deposit > 0 && (
            <span className="text-sm text-gray-500">завдаток {product.deposit} ₴</span>
          )}
        </div>

        {product.description && (
          <div className="mb-4">
            <h3 className="font-medium mb-1">Опис</h3>
            <p className="text-gray-600 text-sm">{product.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-50 p-2 rounded">
            <span className="text-gray-500">Категорія:</span>
            <div className="font-medium">{product.category}</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <span className="text-gray-500">Авто:</span>
            <div className="font-medium">{product.car_model}</div>
          </div>
        </div>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <button onClick={handleAddToCart} className="btn-primary w-full py-3">
          Додати в кошик
        </button>
      </div>
    </div>
  )
}
