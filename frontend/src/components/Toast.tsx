import { useToastStore } from '../store/toast'

const COLORS = {
  success: 'bg-green-600',
  error:   'bg-red-600',
  info:    'bg-blue-600',
}

const ICONS = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
}

export default function Toast() {
  const { message, type, visible, hideToast } = useToastStore()

  return (
    <div
      onClick={hideToast}
      className={`
        fixed bottom-24 left-4 right-4 z-[100]
        flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl
        text-white text-sm font-medium
        transition-all duration-300 ease-in-out
        ${COLORS[type]}
        ${visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}
      `}
    >
      <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-xs font-bold flex-shrink-0 leading-none">
        {ICONS[type]}
      </span>
      <span className="flex-1">{message}</span>
    </div>
  )
}
