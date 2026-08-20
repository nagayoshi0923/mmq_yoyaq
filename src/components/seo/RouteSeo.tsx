import { useLocation } from 'react-router-dom'
import { usePageMeta } from '@/hooks/usePageMeta'
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, STATIC_PUBLIC_META, shouldNoindexPath } from '@/lib/seo'

/**
 * ルート単位のデフォルト meta。
 * 作品・店舗・ブログなど中身依存のページは各ページの usePageMeta が上書きする。
 */
export function useRouteSeo(page: string) {
  const location = useLocation()
  const staticMeta = STATIC_PUBLIC_META[page]
  const noindex = shouldNoindexPath(page, location.pathname)

  usePageMeta({
    title: staticMeta?.title ?? DEFAULT_TITLE,
    description: staticMeta?.description ?? DEFAULT_DESCRIPTION,
    canonicalPath: staticMeta?.path ?? location.pathname,
    noindex,
  })
}
