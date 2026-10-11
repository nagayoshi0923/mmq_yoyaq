/**
 * キャンセルポリシーページ
 * @path /cancel-policy または /:organizationSlug/cancel-policy
 *
 * 組織のページ: 内容が同じ店舗はまとめて 1 回だけ出し、違う店舗だけ別に出す（点検 2026-10-11 の 21）。
 * 全体の /cancel-policy: 条件は組織・店舗ごとに違うため、各組織のページへのリンク一覧を出す。
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { CancellationPolicyView } from '@/components/patterns/cancellation/CancellationPolicyView'
import {
  fetchPublicCancellationPolicies,
  type PublicCancellationPolicy,
} from '@/lib/publicCancellationPolicy'
import { groupPoliciesByContent } from '@/lib/cancellationPolicyGroups'
import { publicPageReadApi } from '@/lib/api/publicPageReadApi'
import { getOrganizationSlugFromPath } from '@/lib/publicBookingPath'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { logger } from '@/utils/logger'

interface OrganizationLink {
  id: string
  slug: string
  name: string
}

/** 全体の /cancel-policy: 組織ごとのキャンセルポリシーへのリンク一覧 */
function OrganizationPolicyLinks() {
  const [organizations, setOrganizations] = useState<OrganizationLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error } = await publicPageReadApi.listActiveOrganizations()
        if (error) throw error
        if (active) setOrganizations((data ?? []).filter(org => org.slug))
      } catch (error) {
        logger.error('組織一覧の取得エラー:', error)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  return (
    <div className="border bg-card p-5 space-y-4">
      <div className="space-y-1">
        <h2>予約先のキャンセルポリシーをご確認ください</h2>
        <p className="ts-body text-muted-foreground">
          キャンセルの期限や料金は、予約先の店舗ごとに決まっています。下の一覧から予約先を選んでください。
        </p>
      </div>
      {loading ? (
        <p className="ts-body text-muted-foreground">読み込み中...</p>
      ) : organizations.length === 0 ? (
        <p className="ts-body text-muted-foreground">
          一覧を読み込めませんでした。予約した店舗のページ下にある「キャンセルポリシー」からご確認ください。
        </p>
      ) : (
        <ul className="divide-y border">
          {organizations.map(org => (
            <li key={org.id}>
              <Link
                to={`/${org.slug}/cancel-policy`}
                className="flex items-center justify-between gap-3 p-4 ts-body hover:bg-muted/30"
              >
                <span>{org.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="ts-muted">
        予約済みの方は、マイページの予約詳細にも、その予約に適用されるキャンセル期限が表示されます。
      </p>
    </div>
  )
}

export function CancelPolicyPage() {
  const organizationSlug = getOrganizationSlugFromPath()
  const requestedStoreId = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('store')
  }, [])
  const requestedEventId = new URLSearchParams(window.location.search).get('event')
  const requestedScenarioId = new URLSearchParams(window.location.search).get('scenario')
  const [policies, setPolicies] = useState<PublicCancellationPolicy[]>([])
  const [loading, setLoading] = useState(Boolean(organizationSlug))
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!organizationSlug) return
    let active = true
    const fetchPolicies = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        const data = await fetchPublicCancellationPolicies({
          organizationSlug,
          storeId: requestedStoreId,
          eventId: requestedEventId,
          scenarioMasterId: requestedScenarioId,
        })
        if (active) setPolicies(data)
      } catch (error) {
        logger.error('公開キャンセルポリシー取得エラー:', error)
        if (active) {
          setPolicies([])
          setLoadError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void fetchPolicies()
    return () => { active = false }
  }, [organizationSlug, requestedStoreId, requestedEventId, requestedScenarioId])

  const groups = useMemo(() => groupPoliciesByContent(policies), [policies])
  const organizationName = policies[0]?.organization_name
  const homePath = organizationSlug ? `/${organizationSlug}` : '/'

  return (
    <PublicLayout organizationSlug={organizationSlug || undefined} organizationName={organizationName}>
      <section className="relative overflow-hidden py-12" style={{ backgroundColor: THEME.primary }}>
        <div
          className="absolute top-0 right-0 w-48 h-48 opacity-20"
          style={{
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)',
          }}
        />
        <div className="max-w-4xl mx-auto px-4 relative">
          <div className="flex items-center gap-2 text-white/80 ts-body mb-2">
            <Link to={homePath} className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>キャンセルポリシー</span>
          </div>
          <h1 className="text-white flex items-center gap-3">
            <AlertTriangle className="w-8 h-8" />
            キャンセルポリシー
          </h1>
          {organizationName && <p className="mt-2 text-white/80 ts-body">{organizationName}</p>}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-12 space-y-6">
        {!organizationSlug ? (
          <OrganizationPolicyLinks />
        ) : loading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : loadError ? (
          <div className="border border-destructive/40 bg-destructive/5 p-6">
            <p className="ts-body">キャンセルポリシーを取得できませんでした。時間をおいて再度お試しください。</p>
          </div>
        ) : policies.length === 0 ? (
          <div className="border bg-card p-6">
            <p className="ts-body text-muted-foreground">
              {requestedStoreId
                ? '指定された店舗の公開キャンセルポリシーは見つかりませんでした。'
                : '公開中の店舗キャンセルポリシーはありません。'}
            </p>
          </div>
        ) : (
          <>
            {groups.length > 1 && (
              <div className="border border-blue-300 bg-blue-50 p-4 ts-body text-blue-900">
                店舗によって条件が異なります。予約する店舗が含まれる欄をご確認ください。
              </div>
            )}
            {groups.length === 1 && policies.length > 1 && (
              <p className="ts-body text-muted-foreground">下の条件は、すべての店舗で共通です。</p>
            )}
            {groups.map(group => (
              <CancellationPolicyView key={group.storeIds.join(',')} policy={group.policy} storeNames={group.storeNames} />
            ))}
          </>
        )}
      </section>
    </PublicLayout>
  )
}
