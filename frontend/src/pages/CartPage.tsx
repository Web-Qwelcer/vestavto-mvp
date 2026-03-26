import { Link } from 'react-router-dom'
import { useCartStore } from '../store/cart'

export default function CartPage() {
  const { items, removeItem, updateQuantity, total, depositTotal } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="p-4 text-center py-12">
        <div className="text-gray-400 mb-4">Кошик порожній</div>
        <Link to="/" className="btn-primary">Перейти до каталогу</Link>
      </div>
    )
  }

  return (
    <div className="p-4 pb-32">
      <h1 className="text-xl font-bold mb-4">Кошик</h1>

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="card flex gap-3">
            <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
              {item.photo ? (
                <img src={item.photo} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Фото</div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm line-clamp-2">{item.name}</h3>
              <div className="text-primary font-bold mt-1">{item.price} ₴</div>
              
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="w-8 text-center">{item.quantity}</span>
                  <button 
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center"
                  >
                    +
                  </button>
                </div>

                <button 
                  onClick={() => removeItem(item.id)}
                  className="text-red-500 text-sm"
                >
                  Видалити
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <div className="max-w-lg mx-auto">
          <div className="flex justify-between mb-2">
            <span>Разом:</span>
            <span className="font-bold">{total()} ₴</span>
          </div>
          {depositTotal() > 0 && (
            <div className="flex justify-between mb-3 text-sm text-gray-500">
              <span>Мін. завдаток:</span>
              <span>{depositTotal()} ₴</span>
            </div>
          )}
          <Link to="/checkout" className="btn-primary w-full py-3 block text-center">
            Оформити замовлення
          </Link>
        </div>
      </div>
    </div>
  )
}
