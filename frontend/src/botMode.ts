// Bot mode is determined by the backend based on which Telegram bot token
// validated the initData — no env variables needed.
// "client"  — opened via client bot: always client UI
// "manager" — opened via manager bot: checks manager role
import { useAuthStore } from './store/auth'

export function getBotMode(): 'client' | 'manager' {
  return useAuthStore.getState().botMode ?? 'client'
}

// Parse Telegram start_param into a traffic source string:
// "product_25"       → "product_deeplink"
// "src_facebook_may" → "facebook_may"
// "" / undefined     → "direct"
export function parseSource(startParam: string): string {
  if (!startParam) return 'direct'
  if (startParam.startsWith('product_')) return 'product_deeplink'
  if (startParam.startsWith('src_')) return startParam.slice(4)
  return startParam
}
