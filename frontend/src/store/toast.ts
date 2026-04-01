import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

interface ToastState {
  message: string
  type: ToastType
  visible: boolean
  showToast: (message: string, type?: ToastType) => void
  hideToast: () => void
}

let _timer: ReturnType<typeof setTimeout> | null = null

export const useToastStore = create<ToastState>((set) => ({
  message: '',
  type: 'info',
  visible: false,
  showToast: (message, type = 'info') => {
    if (_timer) clearTimeout(_timer)
    set({ message, type, visible: true })
    _timer = setTimeout(() => set({ visible: false }), 2800)
  },
  hideToast: () => {
    if (_timer) clearTimeout(_timer)
    set({ visible: false })
  },
}))
