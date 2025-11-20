/**
 * OptimizedImage Component
 *
 * 画像最適化（srcSet、WebP、遅延ロード）をサポートする img コンポーネント
 *
 * 特徴:
 * - 自動的にレスポンシブ画像（srcSet）を生成
 * - WebP フォールバック対応
 * - Supabase Storage の Transform API を活用
 * - Intersection Observer を使用した高度な遅延ロード
 * - 外部URLにも対応（最適化なし）
 */

import React from 'react'
import { getOptimizedImageUrl, generateSrcSet, generateSizes, isSupabaseStorageUrl } from '@/utils/imageUtils'

export interface OptimizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'> {
  /**
   * 画像URL
   */
  src: string | undefined | null
  
  /**
   * 代替テキスト
   */
  alt: string
  
  /**
   * レスポンシブ画像を有効化
   * @default true
   */
  responsive?: boolean
  
  /**
   * srcSet 用のサイズ配列（px）
   * @default [400, 800, 1200]
   */
  srcSetSizes?: number[]
  
  /**
   * sizes 属性のブレークポイント
   * @default { mobile: 400, tablet: 600, desktop: 800 }
   */
  breakpoints?: {
    mobile?: number
    tablet?: number
    desktop?: number
  }
  
  /**
   * WebP 変換を有効化
   * @default true
   */
  useWebP?: boolean
  
  /**
   * 画像品質（1-100）
   * @default 80
   */
  quality?: number
  
  /**
   * 遅延ロードを有効化
   * @default true
   */
  lazy?: boolean

  /**
   * Intersection Observer を使用した高度な遅延ロード
   * @default true
   */
  advancedLazy?: boolean
  
  /**
   * フォールバック要素（画像がない場合）
   */
  fallback?: React.ReactNode
}

/**
 * 最適化された画像コンポーネント
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  responsive = true,
  srcSetSizes = [400, 800, 1200],
  breakpoints = {},
  useWebP = true,
  quality = 80,
  lazy = true,
  advancedLazy = true,
  fallback,
  className,
  ...props
}) => {
  // 画像URLがない場合はフォールバックを表示
  if (!src) {
    return <>{fallback || null}</>
  }

  // Supabase Storage の画像かどうか
  const isSupabaseImage = isSupabaseStorageUrl(src)

  // 外部URLの場合はシンプルな img タグを返す
  if (!isSupabaseImage) {
    return <LazyImage
      src={src}
      alt={alt}
      lazy={lazy}
      advancedLazy={advancedLazy}
      className={className}
      {...props}
    />
  }
  
  // Supabase Storage の場合は最適化を適用
  
  // WebP 対応
  const format = useWebP ? 'webp' : 'origin'

  // 基本URL（WebP版）
  const optimizedSrc = getOptimizedImageUrl(src, {
    quality,
    format
  })

  // srcSet の生成（レスポンシブ対応）
  const srcSet = responsive
    ? generateSrcSet(src, srcSetSizes, { quality, format })
    : undefined

  // sizes 属性の生成
  const sizes = responsive
    ? generateSizes(breakpoints)
    : undefined

  // WebP のフォールバックとして picture タグを使用
  if (useWebP) {
    return <LazyPicture
      webpSrcSet={srcSet || optimizedSrc}
      fallbackSrcSet={
        responsive
          ? generateSrcSet(src, srcSetSizes, { quality, format: 'origin' })
          : undefined
      }
      fallbackSrc={getOptimizedImageUrl(src, { quality, format: 'origin' }) || src}
      sizes={sizes}
      alt={alt}
      lazy={lazy}
      advancedLazy={advancedLazy}
      className={className}
      {...props}
    />
  }

  // WebP を使わない場合はシンプルな img タグ
  return <LazyImage
    src={optimizedSrc || src}
    srcSet={srcSet}
    sizes={sizes}
    alt={alt}
    lazy={lazy}
    advancedLazy={advancedLazy}
    className={className}
    {...props}
  />
}

/**
 * Intersection Observer を使用した高度な遅延ロードコンポーネント
 */
const LazyImage: React.FC<{
  src: string
  alt: string
  srcSet?: string
  sizes?: string
  lazy?: boolean
  advancedLazy?: boolean
  className?: string
  [key: string]: any
}> = ({ src, alt, srcSet, sizes, lazy, advancedLazy, className, ...props }) => {
  const [isVisible, setIsVisible] = useState(!advancedLazy)
  const [hasLoaded, setHasLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!advancedLazy || !imgRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '50px', // 50px前に読み込み開始
        threshold: 0.1
      }
    )

    observer.observe(imgRef.current)

    return () => observer.disconnect()
  }, [advancedLazy])

  const handleLoad = () => setHasLoaded(true)

  if (!isVisible) {
    // プレースホルダー表示
    return (
      <div
        ref={imgRef}
        className={`bg-gray-200 animate-pulse ${className}`}
        style={{ aspectRatio: '1/1' }}
      />
    )
  }

  return (
    <img
      ref={imgRef}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={lazy ? 'lazy' : undefined}
      className={`${className} ${!hasLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
      onLoad={handleLoad}
      {...props}
    />
  )
}

/**
 * Picture タグ用の遅延ロードコンポーネント
 */
const LazyPicture: React.FC<{
  webpSrcSet: string
  fallbackSrcSet?: string
  fallbackSrc: string
  sizes?: string
  alt: string
  lazy?: boolean
  advancedLazy?: boolean
  className?: string
  [key: string]: any
}> = ({
  webpSrcSet,
  fallbackSrcSet,
  fallbackSrc,
  sizes,
  alt,
  lazy,
  advancedLazy,
  className,
  ...props
}) => {
  const [isVisible, setIsVisible] = useState(!advancedLazy)
  const [hasLoaded, setHasLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!advancedLazy || !imgRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '50px', // 50px前に読み込み開始
        threshold: 0.1
      }
    )

    observer.observe(imgRef.current)

    return () => observer.disconnect()
  }, [advancedLazy])

  const handleLoad = () => setHasLoaded(true)

  if (!isVisible) {
    // プレースホルダー表示
    return (
      <div
        ref={imgRef}
        className={`bg-gray-200 animate-pulse ${className}`}
        style={{ aspectRatio: '1/1' }}
      />
    )
  }

  return (
    <picture>
      <source
        type="image/webp"
        srcSet={webpSrcSet}
        sizes={sizes}
      />
      {fallbackSrcSet && (
        <source
          srcSet={fallbackSrcSet}
          sizes={sizes}
        />
      )}
      <img
        ref={imgRef}
        src={fallbackSrc}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        className={`${className} ${!hasLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onLoad={handleLoad}
        {...props}
      />
    </picture>
  )
}

/**
 * OptimizedImage のデフォルトエクスポート
 */
export default OptimizedImage

