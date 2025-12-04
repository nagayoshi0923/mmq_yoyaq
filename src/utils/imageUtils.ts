/**
 * 画像最適化ユーティリティ
 * 
 * Supabase Storage の画像変換機能を活用して、
 * レスポンシブ画像とWebP変換をサポートします。
 */

/**
 * 画像のリサイズオプション
 */
export interface ImageResizeOptions {
  width?: number
  height?: number
  quality?: number // 1-100
  format?: 'webp' | 'avif' | 'origin'
}

/**
 * Supabase Storage の画像URLかどうかを判定
 * 
 * @param url - 画像URL
 * @returns Supabase Storage のURLの場合 true
 */
export function isSupabaseStorageUrl(url: string | undefined | null): boolean {
  if (!url) return false
  return url.includes('.supabase.co/storage/v1/object/public/')
}

/**
 * 画像URLを最適化（リサイズ・フォーマット変換）
 * 
 * Supabase Storage の Transform API を使用します。
 * https://supabase.com/docs/guides/storage/serving/image-transformations
 * 
 * @param url - 元の画像URL
 * @param options - リサイズオプション
 * @returns 最適化された画像URL
 */
export function getOptimizedImageUrl(
  url: string | undefined | null,
  options: ImageResizeOptions = {}
): string | undefined {
  if (!url) return undefined
  
  // Supabase Storage 以外のURLはそのまま返す（外部URL対応）
  if (!isSupabaseStorageUrl(url)) {
    return url
  }
  
  const { width, height, quality = 80, format = 'origin' } = options
  
  try {
    const urlObj = new URL(url)
    const params = new URLSearchParams()
    
    // リサイズパラメータ
    if (width) params.set('width', width.toString())
    if (height) params.set('height', height.toString())
    
    // 品質パラメータ
    if (quality !== 80) params.set('quality', quality.toString())
    
    // フォーマット変換（WebP等）
    if (format !== 'origin') params.set('format', format)
    
    // パラメータがない場合は元のURLを返す
    if (params.toString() === '') return url
    
    // 既存のクエリパラメータと結合
    const existingParams = urlObj.searchParams.toString()
    const newParams = params.toString()
    const combinedParams = existingParams 
      ? `${existingParams}&${newParams}` 
      : newParams
    
    return `${urlObj.origin}${urlObj.pathname}?${combinedParams}`
  } catch (error) {
    // URLパースエラーの場合は元のURLを返す
    logger.warn('Failed to optimize image URL:', error)
    return url
  }
}

/**
 * srcSet 用の画像URLセットを生成
 * 
 * レスポンシブ画像用に複数サイズの画像URLを生成します。
 * 
 * @param url - 元の画像URL
 * @param sizes - 生成するサイズ配列（例: [400, 800, 1200]）
 * @param options - 追加オプション（quality, format等）
 * @returns srcSet 用の文字列
 * 
 * @example
 * const srcSet = generateSrcSet(imageUrl, [400, 800, 1200], { format: 'webp' })
 * // => "url?width=400&format=webp 400w, url?width=800&format=webp 800w, ..."
 */
export function generateSrcSet(
  url: string | undefined | null,
  sizes: number[] = [400, 800, 1200],
  options: Omit<ImageResizeOptions, 'width'> = {}
): string | undefined {
  if (!url) return undefined
  
  // Supabase Storage 以外のURLはそのまま返す
  if (!isSupabaseStorageUrl(url)) {
    return undefined
  }
  
  return sizes
    .map(width => {
      const optimizedUrl = getOptimizedImageUrl(url, { ...options, width })
      return `${optimizedUrl} ${width}w`
    })
    .join(', ')
}

/**
 * WebP をサポートしているかブラウザで確認
 * 
 * @returns WebP サポートの Promise
 */
export async function supportsWebP(): Promise<boolean> {
  // すでにチェック済みの場合はキャッシュから返す
  if (typeof window === 'undefined') return false
  
  // localStorageからキャッシュを確認
  const cached = localStorage.getItem('webp-support')
  if (cached !== null) return cached === 'true'
  
  return new Promise((resolve) => {
    const webP = new Image()
    webP.onload = webP.onerror = () => {
      const support = webP.height === 2
      localStorage.setItem('webp-support', support.toString())
      resolve(support)
    }
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA'
  })
}

/**
 * 画像の sizes 属性を生成
 * 
 * @param breakpoints - ブレークポイント設定
 * @returns sizes 属性の文字列
 * 
 * @example
 * const sizes = generateSizes({ mobile: 400, tablet: 600, desktop: 800 })
 * // => "(max-width: 768px) 400px, (max-width: 1024px) 600px, 800px"
 */
export function generateSizes(breakpoints: {
  mobile?: number
  tablet?: number
  desktop?: number
}): string {
  const { mobile = 400, tablet = 600, desktop = 800 } = breakpoints
  
  return [
    `(max-width: 768px) ${mobile}px`,
    `(max-width: 1024px) ${tablet}px`,
    `${desktop}px`
  ].join(', ')
}

