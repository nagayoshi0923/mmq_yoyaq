/**
 * スロットメモ入力コンポーネント
 * 空スロット：Supabase の schedule_slot_memos テーブルに保存（全スタッフ間で共有）
 * 公演追加時に備考として引き継がれる
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/hooks/useOrganization'
import { logger } from '@/utils/logger'

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

  // マウント時に DB からメモを取得
  useEffect(() => {
    getEmptySlotMemo(date, storeId, timeSlot).then(setMemo)
  }, [date, storeId, timeSlot])

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '18px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 54)}px`
  }, [])

  useEffect(() => {
    if (isEditing) adjustHeight()
  }, [isEditing, memo, adjustHeight])

  const persistMemo = useCallback((value: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveEmptySlotMemo(date, storeId, timeSlot, value, organizationId || undefined)
    }, 500)
  }, [date, storeId, timeSlot, organizationId])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMemo = e.target.value
    setMemo(newMemo)
    persistMemo(newMemo)
    adjustHeight()
  }

  const handleBlur = () => {
    setIsEditing(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
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
