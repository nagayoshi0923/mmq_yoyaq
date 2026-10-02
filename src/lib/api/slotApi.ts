/**
 * 空スロット関連の書き込みAPI（スロットメモ・募集中止スロット）
 *
 * 画面・hook から supabase.from() を直接呼ばず、ここを通す（整備 Phase 2）。
 * 挙動は移行前と同じ。組織の絞り込みは RLS と呼び出し側が渡す organization_id による。
 */
import { supabase } from '@/lib/supabase'

export type SlotTime = 'morning' | 'afternoon' | 'evening'

export const slotMemoApi = {
  /** localStorage 由来のメモを DB に移行する（既にある行は上書きしない） */
  async importMany(rows: Array<{ organization_id: string; date: string; store_id: string; time_slot: string; memo: string; updated_at: string }>) {
    return supabase.from('schedule_slot_memos')
      .upsert(rows, { onConflict: 'organization_id,date,store_id,time_slot', ignoreDuplicates: true })
  },
  /** メモを保存（同じスロットは上書き） */
  async save(row: { organization_id: string; date: string; store_id: string; time_slot: string; memo: string }) {
    return supabase.from('schedule_slot_memos')
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,date,store_id,time_slot' })
  },
  /** 自組織のメモを消す（空文字で保存したとき） */
  async deleteInOrganization(organizationId: string, date: string, storeId: string, timeSlot: string) {
    return supabase.from('schedule_slot_memos').delete()
      .eq('organization_id', organizationId).eq('date', date).eq('store_id', storeId).eq('time_slot', timeSlot)
  },
  /** メモを消す（RLS で自組織のみ） */
  async delete(date: string, storeId: string, timeSlot: string) {
    return supabase.from('schedule_slot_memos').delete()
      .eq('date', date).eq('store_id', storeId).eq('time_slot', timeSlot)
  },
}

export const blockedSlotApi = {
  async block(organizationId: string, date: string, storeId: string, timeSlot: SlotTime) {
    return supabase.from('schedule_blocked_slots')
      .insert({ organization_id: organizationId, date, store_id: storeId, time_slot: timeSlot })
  },
  async unblock(organizationId: string, date: string, storeId: string, timeSlot: SlotTime) {
    return supabase.from('schedule_blocked_slots').delete()
      .eq('organization_id', organizationId).eq('date', date).eq('store_id', storeId).eq('time_slot', timeSlot)
  },
  /** 募集中止・再開の操作履歴を残す */
  async writeLog(organizationId: string, date: string, storeId: string, timeSlot: SlotTime, action: 'blocked' | 'unblocked') {
    const { data: { user } } = await supabase.auth.getUser()
    return supabase.from('schedule_blocked_slot_logs').insert({
      organization_id: organizationId, date, store_id: storeId, time_slot: timeSlot, action, performed_by: user?.id ?? null,
    })
  },
}
