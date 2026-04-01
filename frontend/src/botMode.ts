// Bot mode is determined by the backend based on which Telegram bot token
// validated the initData — no env variables needed.
// "client"  — opened via client bot: always client UI
// "manager" — opened via manager bot: checks manager role
import { useAuthStore } from './store/auth'

export function getBotMode(): 'client' | 'manager' {
  return useAuthStore.getState().botMode ?? 'client'
}
