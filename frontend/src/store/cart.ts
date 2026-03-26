import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CartItem {
  id: number
  name: string
  price: number
  deposit: number
  photo?: string
  quantity: number
}

interface CartState {
  items: CartItem[]
  addItem: (product: Omit<CartItem, 'quantity'>) => void
  removeItem: (productId: number) => void
  updateQuantity: (productId: number, quantity: number) => void
  clearCart: () => void
  total: () => number
  depositTotal: () => number
  itemsCount: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product) => {
        const items = get().items
        const existing = items.find(i => i.id === product.id)
        
        if (existing) {
          set({
            items: items.map(i =>
              i.id === product.id
                ? { ...i, quantity: i.quantity + 1 }
                : i
            )
          })
        } else {
          set({ items: [...items, { ...product, quantity: 1 }] })
        }
      },

      removeItem: (productId) => {
        set({ items: get().items.filter(i => i.id !== productId) })
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId)
          return
        }
        set({
          items: get().items.map(i =>
            i.id === productId ? { ...i, quantity } : i
          )
        })
      },

      clearCart: () => set({ items: [] }),

      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      
      depositTotal: () => get().items.reduce((sum, i) => sum + i.deposit * i.quantity, 0),
      
      itemsCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0)
    }),
    {
      name: 'vestavto-cart'
    }
  )
)
