import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import api from '../../api'
import { useAuthStore } from '../../store/auth'

interface SourceStat {
  source: string
  clients: number
  orders: number
}

export default function AdminAnalyticsPage() {
  const { isManager, isLoading: authLoading, botMode } = useAuthStore()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-sources'],
    queryFn: async () => {
      const res = await api.get('/admin/analytics/sources')
      return res.data.sources as SourceStat[]
    },
    enabled: isManager && !authLoading,
  })

  if (authLoading) return <div className="p-4 text-center text-ink">Завантаження...</div>
  if (!isManager) {
    if (botMode === 'manager') return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">🚫</div>
          <p className="text-lg font-semibold text-ink mb-1">Доступ заборонено</p>
          <p className="text-sm text-gray-500">Цей бот тільки для менеджерів</p>
        </div>
      </div>
    )
    return <Navigate to="/" />
  }

  const totalClients = data?.reduce((s, r) => s + r.clients, 0) ?? 0
  const totalOrders = data?.reduce((s, r) => s + r.orders, 0) ?? 0

  return (
    <div className="p-4 text-ink">
      <h1 className="text-xl font-bold mb-4">Аналітика</h1>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Джерела трафіку
      </h2>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Завантаження...</div>
      ) : !data || data.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Немає даних</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Джерело</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500">Клієнтів</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500">Замовлень</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.source} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 text-ink font-medium">{row.source}</td>
                  <td className="px-4 py-2.5 text-right text-ink">{row.clients}</td>
                  <td className="px-4 py-2.5 text-right text-primary font-medium">{row.orders}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2.5 font-semibold text-ink">Всього</td>
                <td className="px-4 py-2.5 text-right font-semibold text-ink">{totalClients}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-primary">{totalOrders}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
