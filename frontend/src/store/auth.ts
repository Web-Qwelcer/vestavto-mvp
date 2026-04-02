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
  isInitializing: boolean  // true until first auth attempt resolves
  isManager: boolean
  botMode: 'client' | 'manager' | null
  authError: string | null
  login: (initData: string, source?: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  setInitialized: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: false,
      isInitializing: true,
      isManager: false,
      botMode: null,
      authError: null,

      setInitialized: () => set({ isInitializing: false }),

      login: async (initData: string, source?: string) => {
        // Reset stale cached state immediately — prevents wrong interface flash
        set({ isLoading: true, isInitializing: true, authError: null, botMode: null, isManager: false })
        try {
          const params: Record<string, string> = { init_data: initData }
          if (source) params.source = source
          const response = await api.post('/auth/telegram', null, { params })
          const { access_token, role, bot_mode } = response.data
          const botMode = (bot_mode ?? 'client') as 'client' | 'manager'

          set({
            token: access_token,
            isManager: botMode === 'client' ? false : role !== 'client',
            botMode,
            isLoading: false,
          })

          await get().fetchUser()
        } catch (error: any) {
          const msg = error?.response?.data?.detail || 'Помилка авторизації'
          console.error('Auth error:', msg)
          set({ isLoading: false, isInitializing: false, authError: msg })
        }
      },

      logout: () => {
        set({ token: null, user: null, isManager: false, botMode: null, isInitializing: false, authError: null })
      },

      fetchUser: async () => {
        try {
          const response = await api.get('/auth/me')
          const userData: User = response.data
          const { botMode } = get()
          set({
            user: userData,
            isManager: botMode === 'client' ? false : userData.role !== 'client',
            isInitializing: false,
          })
        } catch (error: any) {
          if (error?.response?.status === 401) {
            get().logout()
          } else {
            set({ isInitializing: false })
          }
          console.error('Fetch user error:', error)
        }
      }
    }),
    {
      name: 'vestavto-auth',
      // isInitializing is NOT persisted — always starts as true on mount
      partialize: (state) => ({ token: state.token, isManager: state.isManager, botMode: state.botMode })
    }
  )
)
