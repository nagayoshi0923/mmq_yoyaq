import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isNewArrivalsFilter } from './paths'

/**
 * カタログの URL（/scenario、/{org}/catalog）で、?filter=new なら新作一覧、それ以外は従来の全作品のカタログ。
 * 「カタログ」ボタン（filter なし）は今までどおり全作品へ。
 */
export function CatalogFilterSwitch({ newArrivals, catalog }: { newArrivals: ReactNode; catalog: ReactNode }) {
  const [params] = useSearchParams()
  return <>{isNewArrivalsFilter(params) ? newArrivals : catalog}</>
}
