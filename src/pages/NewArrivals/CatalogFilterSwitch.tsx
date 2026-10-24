import type { ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { legacyNewArrivalsRedirect } from './paths'

/**
 * カタログ（/scenario、/{org}/catalog）の入口。前の版の新作一覧の URL（?filter=new）で来たら、
 * 同じカタログを「新作」のチップを選んだ状態（?genre=新作）で開き直す。それ以外はそのままカタログ。
 */
export function CatalogFilterSwitch({ catalog }: { catalog: ReactNode }) {
  const [params] = useSearchParams()
  const location = useLocation()
  const redirect = legacyNewArrivalsRedirect(params)
  if (redirect !== null) return <Navigate replace to={`${location.pathname}?${redirect}`} />
  return <>{catalog}</>
}
