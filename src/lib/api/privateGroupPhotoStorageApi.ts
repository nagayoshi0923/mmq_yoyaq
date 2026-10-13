/**
 * チャット写真の容量（管理画面の貸切グループ一覧）。DB の private_group_photo_storage_usage（スタッフ・管理者だけ）。
 */
import { supabase } from '@/lib/supabase'
import type { PhotoStorageUsage } from '@/lib/photoStorageUsage'

export async function fetchPhotoStorageUsage(): Promise<PhotoStorageUsage> {
  const { data, error } = await supabase.rpc('private_group_photo_storage_usage')
  if (error) throw error
  return data as PhotoStorageUsage
}
