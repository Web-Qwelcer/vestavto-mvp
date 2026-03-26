import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../api'

interface User {
  id: number
  telegram_id: number
  username?: string
  full_name: string
  phone?: string
  role: 'client' | 'manager' | 'director'
}

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  isManager: boolean
  login: (initData: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: false,
      isManager: false,

      login: async (initData: string) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/telegram', null, {
            params: { init_data: initData }
          })
          const { access_token, role } = response.data
          
          set({
            token: access_token,
            isManager: role !== 'client',
            isLoading: false
          })
          
          // Fetch full user info
          await get().fetchUser()
        } catch (error) {
          console.error('Auth error:', error)
          set({ isLoading: false })
        }
      },

      logout: () => {
        set({ token: null, user: null, isManager: false })
      },

      fetchUser: async () => {
        try {
          const response = await api.get('/auth/me')
          set({ user: response.data })
        } catch (error) {
          console.error('Fetch user error:', error)
        }
      }
    }),
    {
      name: 'vestavto-auth',
      partialize: (state) => ({ token: state.token })
    }
  )
)
