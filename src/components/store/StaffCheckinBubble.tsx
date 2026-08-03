import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/patterns/modal'
import { storeDashboardApi } from '@/lib/api/storeDashboardApi'
import { useAuth } from '@/contexts/AuthContext'

const STORE_KEY = 'mmq_store_dashboard_selected_store'

function getCurrentTime() {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

function formatCheckinTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))
}

export function StaffCheckinBubble({ onStaffCheckin, checkinOnly = false }: { onStaffCheckin?: (staffId: string) => void; checkinOnly?: boolean }) {
  const { isStaff } = useAuth()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(getCurrentTime)
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
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(getCurrentTime()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const canCancelOwnCheckin = Boolean(data.my_checkin && !data.my_checkin.checked_out_at)
  if (!isStaff || (!data?.prompt && !canCancelOwnCheckin)) return null
  const prompt = data.prompt
  const alreadyCheckedIn = prompt
    ? data.gm_status?.find((s: any) => s.id === prompt.staff_id)?.checkin
    : null
  const handleClick = async () => {
    setLoading(true)
    try {
      await storeDashboardApi.action({ action: checkinOnly || !alreadyCheckedIn ? 'staff_checkin' : 'staff_checkout', staff_id: prompt.staff_id, store_id: data.selected_store_id })
      if (!alreadyCheckedIn) onStaffCheckin?.(prompt.staff_id)
      const refreshed = await storeDashboardApi.get(data.selected_store_id)
      setData(refreshed)
    } finally { setLoading(false) }
  }
  const handleCancel = async () => {
    await storeDashboardApi.action({ action: 'staff_checkin_cancel' })
    const refreshed = await storeDashboardApi.get(data.selected_store_id)
    setData(refreshed)
  }
  const showActionBubble = Boolean(prompt) && !(checkinOnly && alreadyCheckedIn)
  const showCheckinStatus = canCancelOwnCheckin && !showActionBubble
  return (
    <>
      {showActionBubble && <aside className="fixed bottom-5 right-5 z-50 w-[320px] rounded-2xl border border-indigo-200 bg-white p-5 shadow-xl" aria-label="出勤打刻">
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600"><span className="h-2 w-2 rounded-full bg-amber-400" />{canCancelOwnCheckin ? `出勤打刻済み（${formatCheckinTime(data.my_checkin.checked_in_at)}）` : checkinOnly || !alreadyCheckedIn ? '出勤打刻がまだです' : '退勤打刻がまだです'}</div>
        <p className="mt-5 text-sm font-semibold text-foreground">{prompt.staff_name}さん、{checkinOnly || !alreadyCheckedIn ? '出勤' : '退勤'}打刻をお願いします。</p>
        <p className="mt-2 text-xs text-muted-foreground">{prompt.start_time.slice(0, 5)} {prompt.scenario} @ {prompt.store_name}</p>
        <Button className="mt-4 h-11 w-full rounded-lg bg-indigo-500 text-sm font-bold hover:bg-indigo-600" onClick={handleClick} disabled={loading}>
          <Clock3 className="mr-2 h-4 w-4" />{checkinOnly ? `${currentTime} 出勤打刻する` : `${alreadyCheckedIn ? '退勤' : '出勤'}打刻する`}
        </Button>
        {canCancelOwnCheckin && <Button type="button" variant="ghost" className="mt-2 h-9 w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setCancelDialogOpen(true)} disabled={loading}>打刻を取り消す</Button>}
        <p className="mt-3 text-xs text-muted-foreground">※打刻するまで表示されます（画面操作は妨げません）</p>
      </aside>}
      {showCheckinStatus && <aside className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg" aria-label="出勤打刻済み">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-sm font-semibold text-foreground">出勤打刻済み（{formatCheckinTime(data.my_checkin.checked_in_at)}）</span>
        <Button type="button" variant="ghost" className="h-8 px-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setCancelDialogOpen(true)} disabled={loading}>取り消す</Button>
      </aside>}
      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleCancel}
        title="打刻を取り消しますか？"
        description="本日の自分の出勤打刻だけを取り消します。取り消し後は、正しい時刻で打ち直せます。"
        confirmLabel="取り消す"
        variant="destructive"
      />
    </>
  )
}
