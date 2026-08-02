import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { storeDashboardApi } from '@/lib/api/storeDashboardApi'
import { useAuth } from '@/contexts/AuthContext'

const STORE_KEY = 'mmq_store_dashboard_selected_store'

export function StaffCheckinBubble() {
  const { isStaff } = useAuth()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!isStaff) return
    let cancelled = false
    const load = async () => {
      try {
        const result = await storeDashboardApi.get(localStorage.getItem(STORE_KEY) ?? undefined)
        if (!cancelled) setData(result)
      } catch { /* 権限や未適用migration時は既存画面を妨げない */ }
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [isStaff])
  if (!isStaff || !data?.prompt) return null
  const prompt = data.prompt
  const alreadyCheckedIn = data.gm_status?.find((s: any) => s.id === prompt.staff_id)?.checkin
  const handleClick = async () => {
    setLoading(true)
    try {
      await storeDashboardApi.action({ action: alreadyCheckedIn ? 'staff_checkout' : 'staff_checkin', staff_id: prompt.staff_id, store_id: data.selected_store_id })
      const refreshed = await storeDashboardApi.get(data.selected_store_id)
      setData(refreshed)
    } finally { setLoading(false) }
  }
  return (
    <aside className="fixed bottom-5 right-5 z-50 w-[320px] rounded-2xl border border-indigo-200 bg-white p-5 shadow-xl" aria-label="出勤打刻">
      <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600"><span className="h-2 w-2 rounded-full bg-amber-400" />{alreadyCheckedIn ? '退勤打刻がまだです' : '出勤打刻がまだです'}</div>
      <p className="mt-5 text-sm font-semibold text-foreground">{prompt.staff_name}さん、{alreadyCheckedIn ? '退勤' : '出勤'}打刻をお願いします。</p>
      <p className="mt-2 text-xs text-muted-foreground">{prompt.start_time.slice(0, 5)} {prompt.scenario} @ {prompt.store_name}</p>
      <Button className="mt-4 h-11 w-full rounded-lg bg-indigo-500 text-sm font-bold hover:bg-indigo-600" onClick={handleClick} disabled={loading}>
        <Clock3 className="mr-2 h-4 w-4" />{prompt.start_time.slice(0, 5)} {alreadyCheckedIn ? '退勤' : '出勤'}打刻する
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">※打刻するまで表示されます（画面操作は妨げません）</p>
    </aside>
  )
}
