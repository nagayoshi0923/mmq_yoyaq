import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { getCurrentOrganizationId } from '@/lib/organization'
import {
  formatRecruitmentPauseRange,
  type StoreRecruitmentPausePeriod,
  type StoreRecruitmentPauseType,
} from '@/lib/storeRecruitmentPause'
import {
  closedDaysFromSettings,
  holidaysFromClosedDays,
  type SpecialDay,
} from '@/lib/storeBusinessHours'
import type { Store } from '@/types'

export type StoreClosureHandle = {
  save: () => Promise<boolean>
}

interface StoreClosureSectionProps {
  store?: Store | null
  status: Store['status']
  onStatusChange: (status: Store['status']) => void
}

export const StoreClosureSection = forwardRef<StoreClosureHandle, StoreClosureSectionProps>(function StoreClosureSection(
  { store, status, onStatusChange },
  ref
) {
  const storeId = store?.id
  const [specialClosedDays, setSpecialClosedDays] = useState<SpecialDay[]>([])
  const [newClosedDay, setNewClosedDay] = useState({ date: '', note: '' })
  const [pausePeriods, setPausePeriods] = useState<StoreRecruitmentPausePeriod[]>([])
  const [newPause, setNewPause] = useState<{
    performance: { starts_on: string; ends_on: string }
    private: { starts_on: string; ends_on: string }
  }>({
    performance: { starts_on: '', ends_on: '' },
    private: { starts_on: '', ends_on: '' },
  })
  const [loading, setLoading] = useState(false)
  const [rowId, setRowId] = useState('')

  useEffect(() => {
    if (!storeId) {
      setSpecialClosedDays([])
      setPausePeriods([])
      setRowId('')
      return
    }
    void load(storeId)
  }, [storeId])

  const load = async (targetStoreId: string) => {
    setLoading(true)
    try {
      const [{ data: hours, error: hoursError }, { data: pauses, error: pauseError }] = await Promise.all([
        supabase
          .from('business_hours_settings')
          .select('id, holidays, special_closed_days')
          .eq('store_id', targetStoreId)
          .maybeSingle(),
        supabase
          .from('store_recruitment_pauses')
          .select('id, store_id, organization_id, pause_type, starts_on, ends_on')
          .eq('store_id', targetStoreId)
          .order('starts_on', { ascending: true, nullsFirst: true }),
      ])
      if (hoursError && hoursError.code !== 'PGRST116') throw hoursError
      if (pauseError) throw pauseError
      if (hours) {
        setRowId(hours.id)
        setSpecialClosedDays(closedDaysFromSettings(hours.special_closed_days as SpecialDay[] | null, hours.holidays))
      } else {
        setRowId('')
        setSpecialClosedDays([])
      }
      setPausePeriods((pauses || []) as StoreRecruitmentPausePeriod[])
    } catch (error) {
      logger.error('休業設定の取得に失敗:', error)
      showToast.error('休業設定の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const addPausePeriod = async (pauseType: StoreRecruitmentPauseType, allDates: boolean) => {
    if (!storeId) return
    const orgId = store?.organization_id || await getCurrentOrganizationId()
    if (!orgId) {
      showToast.error('店舗の組織が不明です')
      return
    }
    const draft = newPause[pauseType]
    const starts_on = allDates ? null : (draft.starts_on || null)
    const ends_on = allDates ? null : (draft.ends_on || null)
    if (!allDates && !starts_on && !ends_on) {
      showToast.error('開始日か終了日を入れてください。全日程なら「全日程で追加」を使います')
      return
    }
    if (starts_on && ends_on && starts_on > ends_on) {
      showToast.error('終了日は開始日以降にしてください')
      return
    }
    const { error } = await supabase.from('store_recruitment_pauses').insert({
      organization_id: orgId,
      store_id: storeId,
      pause_type: pauseType,
      starts_on,
      ends_on,
    })
    if (error) {
      logger.error('募集停止期間の追加エラー:', error)
      showToast.error('追加に失敗しました')
      return
    }
    showToast.success('募集停止期間を追加しました')
    setNewPause(prev => ({ ...prev, [pauseType]: { starts_on: '', ends_on: '' } }))
    await load(storeId)
  }

  const removePausePeriod = async (id: string) => {
    if (!storeId) return
    const { error } = await supabase.from('store_recruitment_pauses').delete().eq('id', id)
    if (error) {
      logger.error('募集停止期間の削除エラー:', error)
      showToast.error('削除に失敗しました')
      return
    }
    showToast.success('募集停止期間を削除しました')
    await load(storeId)
  }

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!storeId) return true
      try {
        const orgId = store?.organization_id || await getCurrentOrganizationId()
        const holidays = holidaysFromClosedDays(specialClosedDays)
        const { data: updated, error: updateError } = await supabase
          .from('business_hours_settings')
          .update({
            special_closed_days: specialClosedDays,
            holidays,
          })
          .eq('store_id', storeId)
          .select('id')
        if (updateError) throw updateError
        if (updated && updated.length > 0) {
          setRowId(updated[0].id)
        } else {
          const { data, error } = await supabase
            .from('business_hours_settings')
            .insert({
              store_id: storeId,
              organization_id: orgId,
              special_closed_days: specialClosedDays,
              holidays,
            })
            .select('id')
            .maybeSingle()
          if (error) throw error
          if (data?.id) setRowId(data.id)
        }
        return true
      } catch (error) {
        logger.error('休業日の保存に失敗:', error)
        showToast.error(getSafeErrorMessage(error, '休業日の保存に失敗しました'))
        return false
      }
    },
  }))

  if (!storeId) {
    return (
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">店舗の状態</p>
        <Label>ステータス</Label>
        <Select value={status || 'active'} onValueChange={(value) => onStatusChange(value as Store['status'])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">営業中</SelectItem>
            <SelectItem value="temporarily_closed">一時休業</SelectItem>
            <SelectItem value="closed">閉鎖</SelectItem>
          </SelectContent>
        </Select>
        <p className="scenario-edit-card__note">特別休業日と募集停止は、店舗を作成したあと設定できます。</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__note">読み込み中...</p>
      </div>
    )
  }

  return (
    <>
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">店舗の状態</p>
        <Label>ステータス</Label>
        <Select value={status || 'active'} onValueChange={(value) => onStatusChange(value as Store['status'])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">営業中</SelectItem>
            <SelectItem value="temporarily_closed">一時休業</SelectItem>
            <SelectItem value="closed">閉鎖</SelectItem>
          </SelectContent>
        </Select>
        <p className="scenario-edit-card__note">店そのものを一時的に閉じるとき使います。下の募集停止とは別です。</p>
      </div>

      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">特別休業日</p>
        <p className="scenario-edit-card__note">
          通常は営業する日を、この日だけ予約不可にします。カレンダーに「休業」と出ます。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2">
          <div>
            <Label htmlFor="special-closed-date">日付</Label>
            <Input
              id="special-closed-date"
              type="date"
              value={newClosedDay.date}
              onChange={(e) => setNewClosedDay(prev => ({ ...prev, date: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="special-closed-note">備考</Label>
            <Input
              id="special-closed-note"
              value={newClosedDay.note}
              onChange={(e) => setNewClosedDay(prev => ({ ...prev, note: e.target.value }))}
              placeholder="例: 店舗メンテナンス"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!newClosedDay.date) {
                  showToast.warning('日付を入力してください')
                  return
                }
                setSpecialClosedDays(prev => [...prev, { ...newClosedDay }])
                setNewClosedDay({ date: '', note: '' })
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {specialClosedDays.length === 0 ? (
          <p className="scenario-edit-card__note">特別休業日はまだありません</p>
        ) : (
          <ul className="space-y-2">
            {specialClosedDays.map((day, index) => (
              <li key={`${day.date}-${index}`} className="flex items-center justify-between gap-2">
                <span className="scenario-edit-card__note">
                  {day.date}{day.note ? ` — ${day.note}` : ''}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSpecialClosedDays(prev => prev.filter((_, i) => i !== index))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">募集停止</p>
        <p className="scenario-edit-card__note">
          この店の通常公演予約と貸切申込を、期間ごとに止めます。既存の予約は消えません。追加した時点で反映されます。
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {([
            { type: 'performance' as const, title: '公演募集停止' },
            { type: 'private' as const, title: '貸切募集停止' },
          ]).map(({ type, title }) => {
            const rows = pausePeriods.filter(p => p.pause_type === type)
            const draft = newPause[type]
            return (
              <div key={type} className="space-y-3 rounded-md border p-3">
                <p className="scenario-edit-card__sublabel">{title}</p>
                {rows.length === 0 ? (
                  <p className="scenario-edit-card__note">期間はまだありません</p>
                ) : (
                  <ul className="space-y-1.5">
                    {rows.map(row => (
                      <li key={row.id} className="flex items-center justify-between gap-2">
                        <span className="scenario-edit-card__note">{formatRecruitmentPauseRange(row)}</span>
                        {row.id && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void removePausePeriod(row.id!)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>開始</Label>
                    <SingleDatePopover
                      date={draft.starts_on}
                      onDateChange={(d) => setNewPause(prev => ({ ...prev, [type]: { ...prev[type], starts_on: d || '' } }))}
                      placeholder="指定なし"
                      buttonClassName="h-7 w-full"
                    />
                  </div>
                  <div>
                    <Label>終了</Label>
                    <SingleDatePopover
                      date={draft.ends_on}
                      onDateChange={(d) => setNewPause(prev => ({ ...prev, [type]: { ...prev[type], ends_on: d || '' } }))}
                      placeholder="指定なし"
                      buttonClassName="h-7 w-full"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void addPausePeriod(type, false)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    期間を追加
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void addPausePeriod(type, true)}>
                    全日程で追加
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
})
