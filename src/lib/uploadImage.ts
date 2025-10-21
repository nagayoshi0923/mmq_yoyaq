import { supabase } from './supabase'
import { logger } from '@/utils/logger'

/**
 * 画像をSupabase Storageにアップロード
 * @param file アップロードするファイル
 * @param bucket バケット名（デフォルト: 'key-visuals'）
 * @param folder フォルダ名（オプション）
 * @returns アップロードされた画像の公開URL
 */
export async function uploadImage(
  file: File,
  bucket: string = 'key-visuals',
  folder?: string
): Promise<{ url: string; path: string } | null> {
  try {
    // ファイル名をユニークにする
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = folder ? `${folder}/${fileName}` : fileName

    logger.log('画像アップロード開始:', filePath)

    // ファイルをアップロード
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      logger.error('画像アップロードエラー:', error)
      return null
    }

    // 公開URLを取得
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)

    logger.log('画像アップロード成功:', publicUrl)

    return {
      url: publicUrl,
      path: data.path
    }
  } catch (error) {
    logger.error('画像アップロード例外:', error)
    return null
  }
}

/**
 * 画像をSupabase Storageから削除
 * @param path 削除する画像のパス
 * @param bucket バケット名（デフォルト: 'key-visuals'）
 * @returns 削除成功の真偽値
 */
export async function deleteImage(
  path: string,
  bucket: string = 'key-visuals'
): Promise<boolean> {
  try {
    logger.log('画像削除開始:', path)

    const { error } = await supabase.storage
      .from(bucket)
      .remove([path])

    if (error) {
      logger.error('画像削除エラー:', error)
      return false
    }

    logger.log('画像削除成功:', path)
    return true
  } catch (error) {
    logger.error('画像削除例外:', error)
    return false
  }
}

/**
 * ファイルサイズを検証
 * @param file 検証するファイル
 * @param maxSizeMB 最大サイズ（MB）デフォルト: 5MB
 * @returns 検証結果
 */
export function validateImageFile(file: File, maxSizeMB: number = 5): {
  valid: boolean
  error?: string
} {
  // ファイルサイズチェック
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `ファイルサイズは${maxSizeMB}MB以下にしてください`
    }
  }

  // ファイルタイプチェック
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: '画像ファイル（JPEG, PNG, GIF, WebP）のみアップロード可能です'
    }
  }

  return { valid: true }
}

