/**
 * クーポンプレゼントページ
 * 新規登録完了後にクーポン付与を表示するページ
 * @path /coupon-present
 */
import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Gift, Ticket, Calendar, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Link, useSearchParams } from 'react-router-dom'
import { validateRedirectUrl } from '@/lib/utils'
import { getCurrentOrganizationId } from '@/lib/organization'

interface CouponInfo {
  id: string
  campaign_name: string
  description: string
  discount_type: 'fixed' | 'percentage'
  discount_amount: number
  uses_remaining: number
  expires_at: string
}

export function CouponPresent() {
  const [searchParams] = useSearchParams()
  const [coupons, setCoupons] = useState<CouponInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  
  // next パラメータから遷移先を取得（セキュリティ検証付き）
  const nextUrl = useMemo(() => {
    const nextParam = searchParams.get('next')
    return validateRedirectUrl(nextParam, '/')
  }, [searchParams])

  useEffect(() => {
    const fetchCoupons = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session?.user) {
          logger.warn('セッションが見つかりません')
          setLoading(false)
          return
        }

        const orgForCustomer = await getCurrentOrganizationId()
        let customerQuery = supabase
          .from('customers')
          .select('id, name')
          .eq('user_id', session.user.id)
        if (orgForCustomer) {
          customerQuery = customerQuery.eq('organization_id', orgForCustomer)
        }
        const { data: customer } = await customerQuery.maybeSingle()

        if (customer) {
          setUserName(customer.name || '')

          // 顧客のクーポンを取得
          const { data: customerCoupons, error } = await supabase
            .from('customer_coupons')
            .select(`
              id,
              uses_remaining,
              expires_at,
              status,
              coupon_campaigns:campaign_id (
                name,
                description,
                discount_type,
                discount_amount
              )
            `)
            .eq('customer_id', customer.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })

          if (error) {
            logger.error('クーポン取得エラー:', error)
          } else if (customerCoupons) {
            const formattedCoupons: CouponInfo[] = customerCoupons
              .filter(c => c.coupon_campaigns)
              .map(c => ({
                id: c.id,
                campaign_name: (c.coupon_campaigns as any).name,
                description: (c.coupon_campaigns as any).description || '',
                discount_type: (c.coupon_campaigns as any).discount_type,
                discount_amount: (c.coupon_campaigns as any).discount_amount,
                uses_remaining: c.uses_remaining,
                expires_at: c.expires_at
              }))
            setCoupons(formattedCoupons)
          }
        }
      } catch (err) {
        logger.error('データ取得エラー:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCoupons()
  }, [])

  const formatDiscount = (type: 'fixed' | 'percentage', amount: number) => {
    if (type === 'fixed') {
      return `${amount.toLocaleString()}円OFF`
    }
    return `${amount}%OFF`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#FAFAFA' }}
    >
      {/* ヘッダー */}
      <header className="py-4 px-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span 
              className="text-xl font-bold"
              style={{ color: THEME.primary }}
            >
              MMQ
            </span>
          </Link>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Card className="border border-gray-200 shadow-lg overflow-hidden">
            {/* 上部の装飾 */}
            <div 
              className="h-2"
              style={{ background: `linear-gradient(90deg, ${THEME.primary}, ${THEME.accent})` }}
            />
            
            <CardHeader className="text-center px-6 pt-8 pb-4">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div 
                  className="p-3 rounded-full"
                  style={{ backgroundColor: `${THEME.primary}15` }}
                >
                  <Gift className="w-8 h-8" style={{ color: THEME.primary }} />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold mb-2">
                クーポンプレゼント！
              </CardTitle>
              {userName && (
                <p className="text-gray-600">
                  {userName}様、ご登録ありがとうございます！
                </p>
              )}
            </CardHeader>
            
            <CardContent className="px-6 pb-8">
              {coupons.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600 justify-center mb-4">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">以下のクーポンが付与されました</span>
                  </div>

                  {coupons.map((coupon) => (
                    <div 
                      key={coupon.id}
                      className="border-2 border-dashed rounded-lg p-4"
                      style={{ borderColor: THEME.primary }}
                    >
                      <div className="flex items-start gap-3">
                        <div 
                          className="p-2 rounded-lg flex-shrink-0"
                          style={{ backgroundColor: `${THEME.primary}15` }}
                        >
                          <Ticket className="w-6 h-6" style={{ color: THEME.primary }} />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg" style={{ color: THEME.primary }}>
                            {formatDiscount(coupon.discount_type, coupon.discount_amount)}
                          </h3>
                          <p className="text-sm font-medium text-gray-800 mt-1">
                            {coupon.campaign_name}
                          </p>
                          {coupon.description && (
                            <p className="text-sm text-gray-500 mt-1">
                              {coupon.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Ticket className="w-3 h-3" />
                              残り{coupon.uses_remaining}回使用可能
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(coupon.expires_at)}まで
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <p className="text-sm text-gray-500 text-center mt-4">
                    クーポンは予約時に自動で表示されます
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500">
                    現在ご利用可能なクーポンはありません
                  </p>
                </div>
              )}

              <div className="mt-6 space-y-3">
                <Button
                  asChild
                  className="w-full h-12 text-base font-semibold"
                  style={{ backgroundColor: THEME.primary }}
                >
                  <Link to={nextUrl}>
                    {nextUrl === '/' ? '公演を探す' : '続ける'}
                  </Link>
                </Button>
                
                <Button
                  asChild
                  variant="outline"
                  className="w-full h-12"
                >
                  <Link to="/mypage">
                    マイページへ
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
