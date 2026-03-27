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
  authError: string | null
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
      authError: null,

      login: async (initData: string) => {
        set({ isLoading: true, authError: null })
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

          await get().fetchUser()
        } catch (error: any) {
          const msg = error?.response?.data?.detail || 'Помилка авторизації'
          console.error('Auth error:', msg)
          set({ isLoading: false, authError: msg })
        }
      },

      logout: () => {
        set({ token: null, user: null, isManager: false, authError: null })
      },

      // Bug fix: also set isManager so it's correct after page reload
      fetchUser: async () => {
        try {
          const response = await api.get('/auth/me')
          const userData: User = response.data
          set({
            user: userData,
            isManager: userData.role !== 'client'
          })
        } catch (error: any) {
          // Token expired or invalid — force logout
          if (error?.response?.status === 401) {
            get().logout()
          }
          console.error('Fetch user error:', error)
        }
      }
    }),
    {
      name: 'vestavto-auth',
      // Зберігаємо token + isManager щоб після reload не було redirect до /
      partialize: (state) => ({ token: state.token, isManager: state.isManager })
    }
  )
)
