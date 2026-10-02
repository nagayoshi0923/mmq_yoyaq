import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PauseCircle, Plus, Trash2 } from 'lucide-react'
import { SectionTitle } from '@/components/settings/SectionTitle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { storeApi } from '@/lib/api/storeApi'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import {
  formatRecruitmentPauseRange,
  type StoreRecruitmentPausePeriod,
  type StoreRecruitmentPauseType,
} from '@/lib/storeRecruitmentPause'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

const PAUSE_TYPES: { type: StoreRecruitmentPauseType; title: string; note: string }[] = [
  { type: 'performance', title: '公演募集停止', note: '通常公演の予約受付を止めます' },
  { type: 'private', title: '貸切募集停止', note: '貸切の申請と承認を止めます' },
]

type Draft = Record<StoreRecruitmentPauseType, { starts_on: string; ends_on: string }>
const emptyDraft = (): Draft => ({ performance: { starts_on: '', ends_on: '' }, private: { starts_on: '', ends_on: '' } })

/**
 * 店舗ごとの募集停止期間（QW-20260909-011）。追加・削除はその場で保存する。
 * 既存の予約は消えない。読み書きは店舗API経由（組織と店舗の所属をサーバーで確かめる）。
 */
export function StoreRecruitmentPauseSection({ storeId }: { storeId: string }) {
  const [periods, setPeriods] = useState<StoreRecruitmentPausePeriod[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const loadVersion = useRef(0)
  const queryClient = useQueryClient()

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    setLoading(true)
    setLoadFailed(false)
    try {
      const data = await storeApi.getRecruitmentPauses(storeId)
      if (version === loadVersion.current) setPeriods(data ?? [])
    } catch (error) {
      logger.error('募集停止期間の取得に失敗:', error)
      if (version === loadVersion.current) {
        setPeriods([])
        setLoadFailed(true)
      }
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    setDraft(emptyDraft())
    void load()
    return () => { loadVersion.current += 1 }
  }, [load])

  const add = async (pauseType: StoreRecruitmentPauseType, allDates: boolean) => {
    const value = draft[pauseType]
    const starts_on = allDates ? null : value.starts_on || null
    const ends_on = allDates ? null : value.ends_on || null
    if (!allDates && !starts_on && !ends_on) {
      showToast.warning('開始日か終了日を入れてください。すべての日を止めるときは「全日程で追加」を使います')
      return
    }
    if (starts_on && ends_on && starts_on > ends_on) {
      showToast.warning('終了日は開始日以降にしてください')
      return
    }
    setBusy(true)
    try {
      await storeApi.addRecruitmentPause(storeId, { pause_type: pauseType, starts_on, ends_on })
      showToast.success('募集停止期間を追加しました')
      void queryClient.invalidateQueries({ queryKey: ['store-recruitment-pauses'] })
      setDraft(prev => ({ ...prev, [pauseType]: { starts_on: '', ends_on: '' } }))
      await load()
    } catch (error) {
      logger.error('募集停止期間の追加に失敗:', error)
      showToast.error(getSafeErrorMessage(error, '募集停止期間を追加できませんでした'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (pauseId: string) => {
    setBusy(true)
    try {
      await storeApi.removeRecruitmentPause(storeId, pauseId)
      showToast.success('募集停止期間を削除しました')
      void queryClient.invalidateQueries({ queryKey: ['store-recruitment-pauses'] })
      await load()
    } catch (error) {
      logger.error('募集停止期間の削除に失敗:', error)
      showToast.error(getSafeErrorMessage(error, '募集停止期間を削除できませんでした'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border p-6">
      <SectionTitle
        icon={PauseCircle}
        label="募集停止"
        description="この店舗の公演の予約受付や貸切の申請を、期間を決めて止めます。すでに入っている予約は消えません。追加・削除はその場で反映されます。"
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : loadFailed ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm">募集停止期間を取得できませんでした。</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>再試行</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PAUSE_TYPES.map(({ type, title, note }) => {
            const rows = periods.filter(p => p.pause_type === type)
            return (
              <div key={type} className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium text-sm">{title}</p>
                  <p className="text-xs text-muted-foreground">{note}</p>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">期間はまだありません</p>
                ) : (
                  <ul className="space-y-1.5">
                    {rows.map(row => (
                      <li key={row.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-1.5">
                        <span className="text-sm">{formatRecruitmentPauseRange(row)}</span>
                        {row.id && (
                          <Button variant="ghost" size="sm" disabled={busy} aria-label={`${title}（${formatRecruitmentPauseRange(row)}）を削除`} onClick={() => void remove(row.id!)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`pause-${type}-start`}>開始</Label>
                    <Input id={`pause-${type}-start`} type="date" value={draft[type].starts_on}
                      onChange={e => setDraft(prev => ({ ...prev, [type]: { ...prev[type], starts_on: e.target.value } }))} />
                  </div>
                  <div>
                    <Label htmlFor={`pause-${type}-end`}>終了</Label>
                    <Input id={`pause-${type}-end`} type="date" value={draft[type].ends_on}
                      onChange={e => setDraft(prev => ({ ...prev, [type]: { ...prev[type], ends_on: e.target.value } }))} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void add(type, false)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />期間を追加
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void add(type, true)}>
                    全日程で追加
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
