/**
 * 公演後の感想（グループページ刷新 段階 4）の店舗側の読み取り。
 * 読めるのはその組織の管理者・在籍スタッフだけ（RPC private_group_feedback_staff）。お客様同士では見えない。
 */
import { supabase } from '@/lib/supabase'

export interface FeedbackCount {
  group_id: string
  count: number
  average: number
}

export interface FeedbackEntry {
  group_id: string
  rating: number
  comment: string
  member_name: string
  is_guest: boolean
  created_at: string
  updated_at: string
}

/** 読める組織のすべてのグループの感想の件数・平均（感想のあるグループだけ） */
export async function readFeedbackCounts(): Promise<Record<string, FeedbackCount>> {
  const { data, error } = await supabase.rpc('private_group_feedback_staff', { p_group_ids: null, p_detail: false })
  if (error) throw error
  const out: Record<string, FeedbackCount> = {}
  for (const row of (data ?? []) as FeedbackCount[]) out[row.group_id] = row
  return out
}

export async function readFeedbackEntries(groupId: string): Promise<FeedbackEntry[]> {
  const { data, error } = await supabase.rpc('private_group_feedback_staff', { p_group_ids: [groupId], p_detail: true })
  if (error) throw error
  return (data ?? []) as FeedbackEntry[]
}
