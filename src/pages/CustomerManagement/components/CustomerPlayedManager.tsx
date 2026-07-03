/**
 * 顧客別 体験済みシナリオ管理（管理画面・スタッフ用 / 予約台帳 Step B）。
 *
 * 体験済み = 予約由来（過去・confirmed/gm_confirmed/checked_in）∪ 手動登録(manual_play_history)。
 * スタッフがこの顧客の体験済みを操作できる:
 *  - 予約由来: 「未体験に戻す/体験済みに戻す」= customer_played_overrides の追加/削除（予約は触らない・表示判定のみ）
 *  - 手動登録: 追加（manual_play_history insert）/ 削除
 * RLS は manual_play_history・customer_played_overrides とも「本人 or スタッフ」許可済み。
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { RotateCcw, Trash2, Plus } from 'lucide-react'
import { fetchPlayedOverrideIds, addPlayedOverride, removePlayedOverride } from '@/lib/playedOverrides'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { formatJstYmd } from '@/utils/jstDate'
import { ConfirmDialog } from '@/components/patterns/modal'

interface PlayedItem {
  scenarioMasterId: string | null
  title: string
  source: 'reservation' | 'manual'
  manualId?: string
  date?: string | null
}

interface CustomerPlayedManagerProps {
  customerId: string
}

const ACTIVE_PLAYED_STATUSES = ['confirmed', 'gm_confirmed', 'checked_in']

export function CustomerPlayedManager({ customerId }: CustomerPlayedManagerProps) {
  const [reservationItems, setReservationItems] = useState<PlayedItem[]>([])
  const [manualItems, setManualItems] = useState<PlayedItem[]>([])
  const [overrideIds, setOverrideIds] = useState<Set<string>>(new Set())
  const [scenarioOptions, setScenarioOptions] = useState<SearchableSelectOption[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  // 手動追加フォーム
  const [newScenarioId, setNewScenarioId] = useState('')
  const [newPlayedAt, setNewPlayedAt] = useState('')
  // 削除確認ダイアログ対象の手動登録ID
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  // 統合リストの「もっと見る」（初期は5件のみ表示）
  const [showAllItems, setShowAllItems] = useState(false)
  const PLAYED_PREVIEW_COUNT = 5

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const nowIso = new Date().toISOString()
      const [resvRes, manualRes, overrides, scenariosRes] = await Promise.all([
        supabase
          .from('reservations')
          .select('scenario_master_id, title, requested_datetime, status')
          .eq('customer_id', customerId)
          .in('status', ACTIVE_PLAYED_STATUSES)
          .lte('requested_datetime', nowIso)
          .order('requested_datetime', { ascending: false }),
        supabase
          .from('manual_play_history')
          .select('id, scenario_title, scenario_master_id, played_at')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER),
        fetchPlayedOverrideIds(customerId),
        supabase
          .from('organization_scenarios_with_master')
          .select('scenario_master_id, title, org_status')
          .eq('org_status', 'available')
          .order('title'),
      ])

      // 予約由来は scenario_master_id 単位で重複排除
      const seen = new Set<string>()
      const resvItems: PlayedItem[] = []
      for (const r of (resvRes.data ?? []) as Array<{ scenario_master_id: string | null; title: string | null; requested_datetime: string }>) {
        const smId = r.scenario_master_id
        if (!smId || seen.has(smId)) continue
        seen.add(smId)
        const title = (r.title ?? '').replace(/【貸切希望】/g, '').replace(/（候補\d+件）/g, '').trim() || '（タイトル不明）'
        resvItems.push({ scenarioMasterId: smId, title, source: 'reservation', date: r.requested_datetime })
      }
      setReservationItems(resvItems)

      setManualItems(
        ((manualRes.data ?? []) as Array<{ id: string; scenario_title: string; scenario_master_id: string | null; played_at: string | null }>).map(m => ({
          scenarioMasterId: m.scenario_master_id,
          title: m.scenario_title || '（タイトル不明）',
          source: 'manual' as const,
          manualId: m.id,
          date: m.played_at,
        }))
      )

      setOverrideIds(overrides)

      const opts: SearchableSelectOption[] = []
      const optSeen = new Set<string>()
      for (const s of (scenariosRes.data ?? []) as Array<{ scenario_master_id: string; title: string }>) {
        if (!s.scenario_master_id || optSeen.has(s.scenario_master_id)) continue
        optSeen.add(s.scenario_master_id)
        opts.push({ value: s.scenario_master_id, label: s.title })
      }
      setScenarioOptions(opts)
    } catch (error) {
      logger.error('体験済み管理データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { load() }, [load])

  const toggleOverride = async (scenarioMasterId: string, makeUnplayed: boolean) => {
    setBusy(true)
    // optimistic
    setOverrideIds(prev => {
      const next = new Set(prev)
      if (makeUnplayed) next.add(scenarioMasterId); else next.delete(scenarioMasterId)
      return next
    })
    try {
      if (makeUnplayed) await addPlayedOverride(customerId, scenarioMasterId)
      else await removePlayedOverride(customerId, scenarioMasterId)
      showToast.success(makeUnplayed ? '未体験に戻しました' : '体験済みに戻しました')
    } catch (error) {
      logger.error('override 変更エラー:', error)
      setOverrideIds(prev => {
        const next = new Set(prev)
        if (makeUnplayed) next.delete(scenarioMasterId); else next.add(scenarioMasterId)
        return next
      })
      showToast.error('変更に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const addManual = async () => {
    if (!newScenarioId) { showToast.error('シナリオを選択してください'); return }
    if (manualItems.length >= MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER) {
      showToast.error(`手動登録は最大${MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER}件までです`); return
    }
    setBusy(true)
    try {
      const title = scenarioOptions.find(o => o.value === newScenarioId)?.label || ''
      const { error } = await supabase.from('manual_play_history').insert({
        customer_id: customerId,
        scenario_title: title,
        scenario_master_id: newScenarioId,
        played_at: newPlayedAt || null,
      })
      if (error) throw error
      setNewScenarioId('')
      setNewPlayedAt('')
      showToast.success('体験済みを追加しました')
      await load()
    } catch (error) {
      logger.error('手動体験済み追加エラー:', error)
      showToast.error('追加に失敗しました（権限エラーの可能性）')
    } finally {
      setBusy(false)
    }
  }

  const deleteManual = (manualId: string) => {
    setDeleteTargetId(manualId)
  }

  const runDeleteManual = async () => {
    const manualId = deleteTargetId
    if (!manualId) return
    setBusy(true)
    try {
      const { error } = await supabase.from('manual_play_history').delete().eq('id', manualId).eq('customer_id', customerId)
      if (error) throw error
      setManualItems(prev => prev.filter(m => m.manualId !== manualId))
      showToast.success('削除しました')
    } catch (error) {
      logger.error('手動体験済み削除エラー:', error)
      showToast.error('削除に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const isOverridden = (smId: string | null) => !!smId && overrideIds.has(smId)

  // 予約由来・手動登録を1つのリストに統合（日付降順・日付なしは末尾）
  const mergedItems = [...reservationItems, ...manualItems].sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? 1 : a.date > b.date ? -1 : 0
    if (a.date) return -1
    if (b.date) return 1
    return 0
  })

  return (
    <div>
      <h4 className="mb-2 font-bold text-sm">体験済みシナリオ管理</h4>
      {loading ? (
        <div className="text-center py-4 text-xs text-muted-foreground">読み込み中...</div>
      ) : (
        <div className="space-y-3">
          {/* 体験済みシナリオ（予約由来・手動登録を統合） */}
          <div className="p-3 bg-background rounded-lg border">
            <div className="text-xs text-muted-foreground mb-2">体験済みシナリオ（合計{mergedItems.length}件）</div>
            {mergedItems.length === 0 ? (
              <div className="text-xs text-muted-foreground">なし</div>
            ) : (
              <div className="space-y-1.5 mb-2 max-h-[280px] overflow-y-auto pr-1">
                {(showAllItems ? mergedItems : mergedItems.slice(0, PLAYED_PREVIEW_COUNT)).map(item => {
                  const overridden = item.source === 'reservation' && isOverridden(item.scenarioMasterId)
                  return (
                    <div key={item.source === 'manual' ? `m-${item.manualId}` : `r-${item.scenarioMasterId}`} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className={`text-sm truncate ${overridden ? 'line-through text-muted-foreground' : ''}`}>{item.title}</span>
                        {item.date
                          ? <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground shrink-0">{formatJstYmd(item.date)}</Badge>
                          : <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground shrink-0">{item.source === 'reservation' ? '予約' : '手動'}</Badge>}
                        {overridden && <Badge variant="outline" className="text-[10px] font-normal text-amber-700 border-amber-300 shrink-0">未体験</Badge>}
                      </div>
                      {item.source === 'reservation' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || !item.scenarioMasterId}
                          className={`h-7 px-2 text-xs shrink-0 ${overridden ? 'text-green-700 border-green-300 hover:bg-green-50' : 'text-amber-700 border-amber-300 hover:bg-amber-50'}`}
                          onClick={() => toggleOverride(item.scenarioMasterId!, !overridden)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          {overridden ? '体験済みに戻す' : '未体験に戻す'}
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled={busy} className="h-7 px-2 text-xs text-destructive border-red-300 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={() => deleteManual(item.manualId!)}>
                          <Trash2 className="h-3 w-3 mr-1" />削除
                        </Button>
                      )}
                    </div>
                  )
                })}
                {!showAllItems && mergedItems.length > PLAYED_PREVIEW_COUNT && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-muted-foreground"
                    onClick={() => setShowAllItems(true)}
                  >
                    もっと見る（あと {mergedItems.length - PLAYED_PREVIEW_COUNT} 件）
                  </Button>
                )}
              </div>
            )}
            {/* 手動追加フォーム */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
              <div className="flex-1 min-w-0">
                <SearchableSelect options={scenarioOptions} value={newScenarioId} onValueChange={setNewScenarioId} placeholder="シナリオを選択して体験済みに追加" />
              </div>
              <div className="w-full sm:w-40">
                <SingleDatePopover date={newPlayedAt} onDateChange={(d) => setNewPlayedAt(d || '')} placeholder="体験日(任意)" />
              </div>
              <Button size="sm" disabled={busy || !newScenarioId} className="h-9 shrink-0" onClick={addManual}>
                <Plus className="h-4 w-4 mr-1" />追加
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}
        title="この手動登録を削除しますか？"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={runDeleteManual}
      />
    </div>
  )
}
