/**
 * スロットメモ入力コンポーネント
 * 空スロット：Supabase の schedule_slot_memos テーブルに保存（全スタッフ間で共有）
 * 公演追加時に備考として引き継がれる
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/hooks/useOrganization'
import { logger } from '@/utils/logger'

// ---- 月単位一括取得（N+M+L のフェッチ枯渇を防ぐ） ----

type SlotMemoMap = Map<string, string>

function memoKey(date: string, storeId: string, timeSlot: string): string {
  return `${date}|${storeId}|${timeSlot}`
}

function slotMemosQueryKey(year: number, month: number) {
  return ['schedule-slot-memos', year, month] as const
}

async function fetchSlotMemosForMonth(year: number, month: number): Promise<SlotMemoMap> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const map: SlotMemoMap = new Map()
  const { data, error } = await supabase
    .from('schedule_slot_memos')
    .select('date, store_id, time_slot, memo')
    .gte('date', startDate)
    .lte('date', endDate)
  if (error) {
    logger.error('スロットメモ一括取得エラー:', error)
    return map
  }
  for (const row of (data as Array<{ date: string; store_id: string; time_slot: string; memo: string }> | null) ?? []) {
    map.set(memoKey(row.date, row.store_id, row.time_slot), row.memo)
  }
  return map
}

/**
 * 月単位で schedule_slot_memos を 1 クエリで取得する。
 * React Query のキャッシュ共有により、同じ月を見ている SlotMemoInput が
 * 何個マウントされても発火するフェッチは 1 回だけ。
 */
export function useScheduleSlotMemos(year: number, month: number) {
  return useQuery({
    queryKey: slotMemosQueryKey(year, month),
    queryFn: () => fetchSlotMemosForMonth(year, month),
    staleTime: 60_000,
  })
}

// ---- localStorage → DB 一回限りの移行 ----

const MIGRATION_DONE_KEY = 'slot-memo-migration-v1-done'

export async function migrateLocalStorageSlotMemos(organizationId: string): Promise<void> {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return

  const prefix = 'slot-memo-'
  const entries: { date: string; storeId: string; timeSlot: string; memo: string }[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(prefix)) continue
    const memo = localStorage.getItem(key)
    if (!memo?.trim()) continue
    // key = slot-memo-{date}-{storeId}-{timeSlot}
    const rest = key.slice(prefix.length)
    // date は YYYY-MM-DD (10文字), 次が storeId (uuid=36文字), 次が timeSlot
    const dateStr = rest.slice(0, 10)
    const remaining = rest.slice(11) // skip '-'
    const storeId = remaining.slice(0, 36)
    const timeSlot = remaining.slice(37) // skip '-'
    if (!dateStr || !storeId || !timeSlot) continue
    entries.push({ date: dateStr, storeId, timeSlot, memo })
  }

  if (entries.length > 0) {
    const rows = entries.map(e => ({
      organization_id: organizationId,
      date: e.date,
      store_id: e.storeId,
      time_slot: e.timeSlot,
      memo: e.memo,
      updated_at: new Date().toISOString()
    }))
    const { error } = await supabase
      .from('schedule_slot_memos')
      .upsert(rows, { onConflict: 'organization_id,date,store_id,time_slot', ignoreDuplicates: true })
    if (error) {
      logger.error('localStorage メモ移行エラー:', error)
      return // 失敗した場合は done フラグを立てない（次回再試行）
    }
    logger.log(`✅ localStorage スロットメモ ${entries.length} 件を DB に移行しました`)
  }

  localStorage.setItem(MIGRATION_DONE_KEY, '1')
}

// ---- Supabase ヘルパー ----

export async function getEmptySlotMemo(date: string, storeId: string, timeSlot: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('schedule_slot_memos')
      .select('memo')
      .eq('date', date)
      .eq('store_id', storeId)
      .eq('time_slot', timeSlot)
      .maybeSingle()
    return data?.memo || ''
  } catch {
    return ''
  }
}

export async function saveEmptySlotMemo(
  date: string,
  storeId: string,
  timeSlot: string,
  memo: string,
  organizationId?: string
): Promise<void> {
  try {
    let orgId = organizationId
    if (!orgId) {
      // organizationId が渡されない場合は store_id から組織を特定
      const { data } = await supabase
        .from('stores')
        .select('organization_id')
        .eq('id', storeId)
        .maybeSingle()
      orgId = data?.organization_id
    }
    if (!orgId) return

    if (memo.trim()) {
      await supabase
        .from('schedule_slot_memos')
        .upsert(
          { organization_id: orgId, date, store_id: storeId, time_slot: timeSlot, memo, updated_at: new Date().toISOString() },
          { onConflict: 'organization_id,date,store_id,time_slot' }
        )
    } else {
      await supabase
        .from('schedule_slot_memos')
        .delete()
        .eq('organization_id', orgId)
        .eq('date', date)
        .eq('store_id', storeId)
        .eq('time_slot', timeSlot)
    }
  } catch (err) {
    logger.error('スロットメモ保存エラー:', err)
  }
}

export async function clearEmptySlotMemo(date: string, storeId: string, timeSlot: string): Promise<void> {
  try {
    await supabase
      .from('schedule_slot_memos')
      .delete()
      .eq('date', date)
      .eq('store_id', storeId)
      .eq('time_slot', timeSlot)
  } catch (err) {
    logger.error('スロットメモ削除エラー:', err)
  }
}

// ---- コンポーネント ----

interface SlotMemoInputProps {
  date: string
  storeId: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
}

export function SlotMemoInput({ date, storeId, timeSlot }: SlotMemoInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [memo, setMemo] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { organizationId } = useOrganization()
  const queryClient = useQueryClient()

  // 月単位で全メモを 1 クエリで取得（800+ セルが共有キャッシュを使うので fetch は月 1 回）
  const [yearStr, monthStr] = date.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const { data: memosMap } = useScheduleSlotMemos(year, month)
  const cachedMemo = memosMap?.get(memoKey(date, storeId, timeSlot)) ?? ''

  // 初回マウント時に localStorage → DB への一回限りの移行を実行
  useEffect(() => {
    if (organizationId) {
      void migrateLocalStorageSlotMemos(organizationId)
    }
  }, [organizationId])

  // キャッシュから取得したメモを表示用 state に同期
  useEffect(() => {
    setMemo(cachedMemo)
  }, [cachedMemo])

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '18px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 54)}px`
  }, [])

  useEffect(() => {
    if (isEditing) adjustHeight()
  }, [isEditing, memo, adjustHeight])

  const updateMemoCache = useCallback((value: string) => {
    queryClient.setQueryData<SlotMemoMap>(slotMemosQueryKey(year, month), (prev) => {
      const next: SlotMemoMap = new Map(prev ?? [])
      if (value) {
        next.set(memoKey(date, storeId, timeSlot), value)
      } else {
        next.delete(memoKey(date, storeId, timeSlot))
      }
      return next
    })
  }, [queryClient, year, month, date, storeId, timeSlot])

  const persistMemo = useCallback((value: string) => {
    updateMemoCache(value)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveEmptySlotMemo(date, storeId, timeSlot, value, organizationId || undefined)
    }, 500)
  }, [date, storeId, timeSlot, organizationId, updateMemoCache])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMemo = e.target.value
    setMemo(newMemo)
    persistMemo(newMemo)
    adjustHeight()
  }

  const handleBlur = () => {
    setIsEditing(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    updateMemoCache(memo)
    saveEmptySlotMemo(date, storeId, timeSlot, memo, organizationId || undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setIsEditing(false)
  }

  if (isEditing) {
    return (
      <Textarea
        ref={textareaRef}
        value={memo}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="memo"
        className="w-full text-[11px] p-0.5 resize-none border-0 focus:border-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none placeholder:text-muted-foreground/50"
        style={{ backgroundColor: '#F6F9FB', lineHeight: '1.3', height: '18px', minHeight: '18px' }}
        autoFocus
      />
    )
  }

  return (
    <div
      className={`w-full cursor-pointer p-0.5 text-[11px] whitespace-pre-wrap text-left hover:bg-gray-100 leading-tight ${memo ? 'text-gray-700' : 'text-gray-300'}`}
      style={{ backgroundColor: '#F6F9FB', minHeight: '18px' }}
      onClick={() => setIsEditing(true)}
    >
      {memo || 'memo'}
    </div>
  )
}
