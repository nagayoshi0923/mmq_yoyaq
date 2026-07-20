/**
 * キャンセルポリシーページ
 * @path /cancel-policy または /:organizationSlug/cancel-policy
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
import { getOrganizationSlugFromPath } from '@/lib/publicBookingPath'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { logger } from '@/utils/logger'

export function CancelPolicyPage() {
  const organizationSlug = getOrganizationSlugFromPath()
  const requestedStoreId = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('store')
  }, [])
  const [policies, setPolicies] = useState<PublicCancellationPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    const fetchPolicies = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        if (!organizationSlug) {
          if (active) setPolicies([])
          return
        }
        const data = await fetchPublicCancellationPolicies({
          organizationSlug,
          storeId: requestedStoreId,
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
  }, [organizationSlug, requestedStoreId])

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
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
        ) : !organizationSlug ? (
          <div className="border bg-card p-6 space-y-2">
            <h2>店舗の予約サイトからご確認ください</h2>
            <p className="ts-body text-muted-foreground">
              キャンセル条件は組織・店舗ごとに異なるため、予約先のページにあるキャンセルポリシーをご確認ください。
            </p>
          </div>
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
            {policies.length > 1 && (
              <div className="border border-blue-300 bg-blue-50 p-4 ts-body text-blue-900">
                店舗ごとに条件が異なる場合があります。予約する店舗の欄をご確認ください。
              </div>
            )}
            {policies.map(policy => (
              <CancellationPolicyView key={policy.store_id} policy={policy} />
            ))}
          </>
        )}
      </section>
    </PublicLayout>
  )
}
