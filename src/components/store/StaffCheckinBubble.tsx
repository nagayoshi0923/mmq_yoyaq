import { useCallback, useEffect, useState } from 'react'
import { Clock3, RotateCcw } from 'lucide-react'
import { ConfirmDialog } from '@/components/patterns/modal'
import { Button } from '@/components/ui/button'
import { storeDashboardApi } from '@/lib/api/storeDashboardApi'
import {
  formatCheckedInTime,
  formatClientCurrentTime,
  normalizeStaffCheckinResponse,
  type StaffCheckinState,
} from './staffCheckinState'

export interface StaffCheckinClient {
  getState: (storeId: string) => Promise<unknown>
  checkIn: (storeId: string) => Promise<unknown>
  cancel: (storeId: string) => Promise<unknown>
}

interface StaffCheckinBubbleProps {
  storeId: string | null
  client?: StaffCheckinClient
}

const defaultClient: StaffCheckinClient = {
  getState: storeDashboardApi.getStaffCheckin,
  checkIn: storeDashboardApi.staffCheckin,
  cancel: storeDashboardApi.cancelStaffCheckin,
}

export function StaffCheckinBubble({ storeId, client = defaultClient }: StaffCheckinBubbleProps) {
  const [state, setState] = useState<StaffCheckinState>(storeId ? { status: 'loading' } : { status: 'unavailable' })
  const [currentTime, setCurrentTime] = useState(formatClientCurrentTime)
  const [isMutating, setIsMutating] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  const load = useCallback(async () => {
    if (!storeId) {
      setState({ status: 'unavailable' })
      return
    }
    setState({ status: 'loading' })
    try {
      setState(normalizeStaffCheckinResponse(await client.getState(storeId)))
    } catch (error) {
      setState({ status: 'error', message: getErrorMessage(error, '出勤打刻の取得に失敗しました。') })
    }
  }, [client, storeId])

  useEffect(() => {
    let active = true
    if (!storeId) {
      setState({ status: 'unavailable' })
      return () => { active = false }
    }
    setState({ status: 'loading' })
    client.getState(storeId)
      .then(value => {
        if (active) setState(normalizeStaffCheckinResponse(value))
      })
      .catch(error => {
        if (active) setState({ status: 'error', message: getErrorMessage(error, '出勤打刻の取得に失敗しました。') })
      })
    return () => { active = false }
  }, [client, storeId])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(formatClientCurrentTime()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const handleCheckin = async () => {
    if (!storeId) return
    setIsMutating(true)
    try {
      await client.checkIn(storeId)
      await load()
    } catch (error) {
      setState({ status: 'error', message: getErrorMessage(error, '出勤打刻に失敗しました。') })
    } finally {
      setIsMutating(false)
    }
  }

  const handleCancel = async () => {
    if (!storeId) return
    setIsMutating(true)
    try {
      await client.cancel(storeId)
      await load()
    } catch (error) {
      setState({ status: 'error', message: getErrorMessage(error, '出勤打刻の取り消しに失敗しました。') })
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <>
      <StaffCheckinPanel
        state={state}
        currentTime={currentTime}
        disabled={isMutating}
        onCheckin={handleCheckin}
        onCancel={() => setCancelDialogOpen(true)}
        onRetry={load}
      />
      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleCancel}
        title="出勤打刻を取り消しますか？"
        description="本日の自分の出勤打刻だけを取り消します。取り消した後は、現在時刻で打ち直せます。"
        confirmLabel="取り消す"
        variant="destructive"
        isLoading={isMutating}
      />
    </>
  )
}

export function StaffCheckinPanel({
  state,
  currentTime,
  disabled,
  onCheckin,
  onCancel,
  onRetry,
}: {
  state: StaffCheckinState
  currentTime: string
  disabled: boolean
  onCheckin: () => void
  onCancel: () => void
  onRetry: () => void
}) {
  return (
    <aside className="fixed bottom-5 right-5 z-50 w-[320px] rounded-2xl border border-indigo-200 bg-white p-5 shadow-xl" aria-label="出勤打刻">
      {state.status === 'loading' && <p aria-live="polite">出勤打刻を確認中...</p>}
      {state.status === 'unavailable' && <p>出勤打刻は現在利用できません。</p>}
      {state.status === 'error' && (
        <div className="space-y-3" role="status">
          <p>{state.message}</p>
          <Button type="button" variant="outline" className="w-full" onClick={onRetry}>もう一度確認する</Button>
        </div>
      )}
      {state.status === 'ready-unchecked' && (
        <div className="space-y-4">
          <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" />出勤打刻がまだです</p>
          <Button type="button" className="h-11 w-full bg-indigo-500 hover:bg-indigo-600" onClick={onCheckin} disabled={disabled}>
            <Clock3 className="mr-2 h-4 w-4" />{currentTime} 出勤打刻する
          </Button>
        </div>
      )}
      {state.status === 'ready-checked' && (
        <div className="space-y-4">
          <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />出勤打刻済み（{formatCheckedInTime(state.checkedInAt)}）</p>
          <Button type="button" variant="outline" className="w-full" onClick={onCancel} disabled={disabled}>
            <RotateCcw className="mr-2 h-4 w-4" />取り消す
          </Button>
        </div>
      )}
    </aside>
  )
}

export function StaffCheckinFallback() {
  return (
    <aside className="fixed bottom-5 right-5 z-50 w-[320px] rounded-2xl border border-indigo-200 bg-white p-5 shadow-xl" aria-label="出勤打刻">
      <p>出勤打刻を表示できませんでした。店舗ダッシュボードの他の機能はそのまま利用できます。</p>
    </aside>
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
