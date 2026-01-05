import { supabase } from './supabase'
import { logger } from '@/utils/logger'

/**
 * 画像を圧縮する
 * @param file 元の画像ファイル
 * @param options 圧縮オプション
 * @returns 圧縮されたBlobまたは元のファイル
 */
export async function compressImage(
  file: File,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {}
): Promise<Blob> {
  const { maxWidth = 1920, maxHeight = 1080, quality = 0.8 } = options

  return new Promise((resolve, reject) => {
    // GIFは圧縮しない（アニメーションが壊れる）
    if (file.type === 'image/gif') {
      resolve(file)
      return
    }

    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    img.onload = () => {
      let { width, height } = img

      // アスペクト比を維持してリサイズ
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      canvas.width = width
      canvas.height = height

      if (!ctx) {
        resolve(file)
        return
      }

      // 高品質なリサイズ
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      // WebP対応ブラウザならWebPで出力、そうでなければJPEG
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            logger.log(`画像圧縮: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB (${Math.round((1 - blob.size / file.size) * 100)}%削減)`)
            resolve(blob)
          } else {
            resolve(file)
          }
        },
        outputType,
        quality
      )
    }

    img.onerror = () => {
      logger.warn('画像圧縮失敗、元ファイルを使用')
      resolve(file)
    }

    img.src = URL.createObjectURL(file)
  })
}

/**
 * 画像をSupabase Storageにアップロード（自動圧縮付き）
 * @param file アップロードするファイル
 * @param bucket バケット名（デフォルト: 'key-visuals'）
 * @param folder フォルダ名（オプション）
 * @param compress 圧縮するかどうか（デフォルト: true）
 * @returns アップロードされた画像の公開URL
 */
export async function uploadImage(
  file: File,
  bucket: string = 'key-visuals',
  folder?: string,
  compress: boolean = true
): Promise<{ url: string; path: string } | null> {
  try {
    // 圧縮処理
    let uploadFile: Blob | File = file
    if (compress && file.size > 500 * 1024) { // 500KB以上なら圧縮
      uploadFile = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85
      })
    }

    // ファイル名をユニークにする（圧縮後はjpegになる可能性があるため拡張子を調整）
    const originalExt = file.name.split('.').pop()
    const ext = file.type === 'image/png' ? 'png' : (file.type === 'image/gif' ? 'gif' : 'jpg')
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    const filePath = folder ? `${folder}/${fileName}` : fileName

    logger.log('画像アップロード開始:', filePath, `(${(uploadFile.size / 1024).toFixed(0)}KB)`)

    // ファイルをアップロード
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, uploadFile, {
        cacheControl: '31536000', // 1年キャッシュ
        upsert: false,
        contentType: file.type === 'image/png' ? 'image/png' : (file.type === 'image/gif' ? 'image/gif' : 'image/jpeg')
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
 * ファイルサイズを検証（画像用）
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

/**
 * メディアファイル（画像・動画）を検証
 * @param file 検証するファイル
 * @param maxImageSizeMB 画像の最大サイズ（MB）デフォルト: 30MB
 * @param maxVideoSizeMB 動画の最大サイズ（MB）デフォルト: 100MB
 * @returns 検証結果
 */
export function validateMediaFile(file: File, maxImageSizeMB: number = 30, maxVideoSizeMB: number = 100): {
  valid: boolean
  error?: string
  type: 'image' | 'video' | 'unknown'
} {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']

  const isImage = imageTypes.includes(file.type)
  const isVideo = videoTypes.includes(file.type)

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: '画像（JPEG, PNG, GIF, WebP）または動画（MP4, WebM, MOV）のみアップロード可能です',
      type: 'unknown'
    }
  }

  const maxSizeMB = isVideo ? maxVideoSizeMB : maxImageSizeMB
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `${isVideo ? '動画' : '画像'}ファイルは${maxSizeMB}MB以下にしてください`,
      type: isVideo ? 'video' : 'image'
    }
  }

  return { valid: true, type: isVideo ? 'video' : 'image' }
}

/**
 * MIMEタイプから動画の拡張子を取得
 */
function getVideoExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
  }
  return mimeToExt[mimeType] || 'mp4'
}

/**
 * 動画をアップロード（圧縮なし）
 * @param file アップロードするファイル
 * @param bucket バケット名
 * @param folder フォルダ名（オプション）
 * @returns アップロードされた動画の公開URL
 */
export async function uploadVideo(
  file: File,
  bucket: string = 'key-visuals',
  folder?: string
): Promise<{ url: string; path: string } | null> {
  try {
    // MIMEタイプから拡張子を決定（ファイル名から取得するより確実）
    const ext = getVideoExtension(file.type)
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    const filePath = folder ? `${folder}/${fileName}` : fileName

    logger.log('動画アップロード開始:', filePath, `(${(file.size / 1024 / 1024).toFixed(1)}MB)`)

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '31536000',
        upsert: false,
        contentType: file.type
      })

    if (error) {
      logger.error('動画アップロードエラー:', error)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)

    logger.log('動画アップロード成功:', publicUrl)

    return {
      url: publicUrl,
      path: data.path
    }
  } catch (error) {
    logger.error('動画アップロード例外:', error)
    return null
  }
}

/**
 * メディア（画像または動画）をアップロード
 * 画像は自動圧縮、動画はそのままアップロード
 */
export async function uploadMedia(
  file: File,
  bucket: string = 'key-visuals',
  folder?: string
): Promise<{ url: string; path: string; type: 'image' | 'video' } | null> {
  const validation = validateMediaFile(file)
  
  if (!validation.valid) {
    logger.error('メディア検証エラー:', validation.error)
    return null
  }

  if (validation.type === 'video') {
    const result = await uploadVideo(file, bucket, folder)
    return result ? { ...result, type: 'video' } : null
  } else {
    const result = await uploadImage(file, bucket, folder, true)
    return result ? { ...result, type: 'image' } : null
  }
}

