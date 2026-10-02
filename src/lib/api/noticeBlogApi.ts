/**
 * 予約の注意事項（booking_notices）とブログ記事（blog_posts）の書き込みAPI
 *
 * 設定画面から supabase.from() を直接呼ばず、ここを通す（整備 Phase 2）。
 * 絞り込みは元のまま id のみ。戻り値は supabase の { data, error } をそのまま返す（呼び出し側が error を見る）。
 */
import { supabase } from '@/lib/supabase'

export const bookingNoticeApi = {
  async updateById(id: string, fields: Record<string, unknown>) {
    return supabase.from('booking_notices').update(fields).eq('id', id)
  },
  async insert(row: Record<string, unknown>) {
    return supabase.from('booking_notices').insert(row)
  },
  async deleteById(id: string) {
    return supabase.from('booking_notices').delete().eq('id', id)
  },
}

export const blogPostApi = {
  async updateById(id: string, fields: Record<string, unknown>) {
    return supabase.from('blog_posts').update(fields).eq('id', id)
  },
  async insert(row: Record<string, unknown>) {
    return supabase.from('blog_posts').insert(row)
  },
  async deleteById(id: string) {
    return supabase.from('blog_posts').delete().eq('id', id)
  },
}
