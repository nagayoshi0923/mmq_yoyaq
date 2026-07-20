import { memo, useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { ChevronDown, Loader2 } from 'lucide-react'
import {
  CancellationPolicyLink,
  CancellationPolicyView,
} from '@/components/patterns/cancellation/CancellationPolicyView'
import { getOrganizationSlugFromPath } from '@/lib/publicBookingPath'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import {
  fetchPublicCancellationPolicies,
  type PublicCancellationPolicy,
} from '@/lib/publicCancellationPolicy'

export interface BookingNoticeProps {
  reservationDeadlineHours?: number
  hasPreReading?: boolean
  mode?: 'schedule' | 'private'
  storeId?: string | null
  organizationSlug?: string | null
}

interface Notice {
  id: string
  content: string
  applicable_types: string[]
  store_id: string | null
  store_ids: string[] | null
  requires_pre_reading: boolean
  organization_id: string | null
}

export const BookingNotice = memo(function BookingNotice({
  reservationDeadlineHours,
  hasPreReading,
  mode = 'schedule',
  storeId = null,
  organizationSlug = null,
}: BookingNoticeProps) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPolicyOpen, setIsPolicyOpen] = useState(false)
  const [policies, setPolicies] = useState<PublicCancellationPolicy[]>([])
  const [isPolicyLoading, setIsPolicyLoading] = useState(false)
  const [policyLoadError, setPolicyLoadError] = useState(false)
  const currentOrganizationSlug = organizationSlug || getOrganizationSlugFromPath()

  // DBから注意事項を取得
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const slug = currentOrganizationSlug
        if (!slug) {
          setNotices([])
          return
        }
        const organization = await resolveOrganizationFromPathSegment(slug, { requireActive: true })
        if (!organization) {
          setNotices([])
          return
        }

        // modeをDBのcategory名にマッピング
        const categoryType = mode === 'schedule' ? 'open' : 'private'

        const { data, error } = await supabase
          .from('booking_notices')
          .select('id, content, applicable_types, store_id, store_ids, requires_pre_reading, organization_id')
          .eq('is_active', true)
          .contains('applicable_types', [categoryType])
          .order('sort_order', { ascending: true })

        if (error) throw error

        // フィルタリング
        const filtered = (data || []).filter(notice => {
          const organizationMatch = notice.organization_id === organization.id

          // 店舗フィルタ（store_ids優先、後方互換でstore_idも対応）
          const storeIds = notice.store_ids?.length > 0 ? notice.store_ids : (notice.store_id ? [notice.store_id] : [])
          const storeMatch = storeIds.length === 0 || (storeId && storeIds.includes(storeId))
          
          // 事前読み込み条件（requires_pre_readingがtrueの場合、hasPreReadingがtrueでないと表示しない）
          const preReadingMatch = !notice.requires_pre_reading || hasPreReading === true
          
          return organizationMatch && storeMatch && preReadingMatch
        })

        setNotices(filtered)
      } catch (error) {
        logger.error('注意事項の取得に失敗:', error)
        setNotices([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotices()
  }, [mode, storeId, hasPreReading, currentOrganizationSlug])

  // 展開された時だけ、現在の組織・店舗に公開されているポリシーを取得する。
  // 店舗未確定（storeId=null）のときは全店舗分を取らず、正規ページへ誘導するだけにする。
  useEffect(() => {
    if (!isPolicyOpen) return
    if (!storeId) {
      setPolicies([])
      setPolicyLoadError(false)
      setIsPolicyLoading(false)
      return
    }

    let active = true
    const fetchPolicies = async () => {
      setIsPolicyLoading(true)
      setPolicyLoadError(false)
      try {
        if (!currentOrganizationSlug) {
          if (active) setPolicies([])
          return
        }
        const data = await fetchPublicCancellationPolicies({
          organizationSlug: currentOrganizationSlug,
          storeId,
        })
        if (active) setPolicies(data)
      } catch (error) {
        logger.error('予約画面のキャンセルポリシー取得に失敗:', error)
        if (active) {
          setPolicies([])
          setPolicyLoadError(true)
        }
      } finally {
        if (active) setIsPolicyLoading(false)
      }
    }

    void fetchPolicies()
    return () => { active = false }
  }, [isPolicyOpen, storeId, currentOrganizationSlug])

  return (
    <div>
      <h3 className="mb-1.5 ts-label">
        注意事項
        <span className="ml-2 text-xs text-amber-600 font-normal">※必ずご確認ください</span>
      </h3>
      <Card>
        <CardContent className="p-3 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-1">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : notices.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground mb-2">
              {notices.map((notice) => (
                <li key={notice.id}>• {notice.content}</li>
              ))}
            </ul>
          )}

          <div className={notices.length > 0 ? 'border-t pt-3' : undefined}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                aria-expanded={isPolicyOpen}
                onClick={() => setIsPolicyOpen(open => !open)}
                className="inline-flex w-full items-center justify-between gap-2 border px-3 py-2 text-left ts-body font-medium hover:bg-muted/40 sm:w-auto"
              >
                キャンセルポリシーを確認
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${isPolicyOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              <CancellationPolicyLink
                organizationSlug={currentOrganizationSlug}
                storeId={storeId}
                className="inline-flex items-center gap-1 ts-muted underline"
              >
                公開ページで確認
              </CancellationPolicyLink>
            </div>

            {isPolicyOpen && (
              <div className="mt-3 space-y-3">
                {!storeId ? (
                  <p className="border border-blue-200 bg-blue-50 p-3 ts-body text-blue-900">
                    店舗が未確定または複数選択中です。該当する店舗のポリシーを店舗別にご確認ください。
                  </p>
                ) : isPolicyLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 ts-body text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    キャンセルポリシーを読み込み中...
                  </div>
                ) : policyLoadError ? (
                  <p className="border border-destructive/40 bg-destructive/5 p-3 ts-body">
                    キャンセルポリシーを取得できませんでした。公開ページからご確認ください。
                  </p>
                ) : policies.length === 0 ? (
                  <p className="border bg-muted/20 p-3 ts-body text-muted-foreground">
                    公開中のキャンセルポリシーはありません。店舗へお問い合わせください。
                  </p>
                ) : (
                  policies.map(policy => (
                    <CancellationPolicyView key={policy.store_id} policy={policy} />
                  ))
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
})
