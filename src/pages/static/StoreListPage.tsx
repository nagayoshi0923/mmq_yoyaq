/**
 * 参加団体一覧ページ
 * @path /stores
 */
import { logger } from '@/utils/logger'
import { useState, useEffect } from 'react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Building2, ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { publicPageReadApi } from '@/lib/api/publicPageReadApi'

interface Organization {
  id: string
  slug: string
  name: string
  logo_url?: string
}

export function StoreListPage() {
  const navigate = useNavigate()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      // 組織一覧を取得
      const { data: orgData, error } = await publicPageReadApi.listActiveOrganizations()

      logger.log('🏢 組織取得結果:', orgData?.length, '件', error ? `エラー: ${JSON.stringify(error)}` : '')

      if (error) {
        logger.error('組織取得エラー:', error)
      }

      if (orgData) {
        setOrganizations(orgData)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicLayout>
      {/* ヒーロー */}
      <section 
        className="relative overflow-hidden py-12"
        style={{ backgroundColor: THEME.primary }}
      >
        <div 
          className="absolute top-0 right-0 w-48 h-48 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div className="max-w-6xl mx-auto px-4 relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
            <Link to="/" className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>参加団体一覧</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Building2 className="w-8 h-8" />
            参加団体一覧
          </h1>
          <p className="text-white/80 mt-2">
            MMQに参加しているマーダーミステリー運営団体
          </p>
        </div>
      </section>

      {/* 団体リスト */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        {loading ? (
          <div className="flex justify-center py-12">
            <div 
              className="animate-spin h-8 w-8 border-4 border-t-transparent"
              style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }}
            />
          </div>
        ) : organizations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            該当する団体がありません
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {organizations.map(org => (
              <div 
                key={org.id}
                className="bg-white border border-gray-200 hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => navigate(`/${org.slug}`)}
              >
                <div className="p-6">
                  {/* ロゴ・アイコン */}
                  <div className="flex items-center gap-4 mb-4">
                    {org.logo_url ? (
                      <img
                        src={org.logo_url}
                        alt={org.name}
                        className="w-16 h-16 object-cover"
                        style={{ borderRadius: 0 }}
                      />
                    ) : (
                      <div 
                        className="w-16 h-16 flex items-center justify-center"
                        style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
                      >
                        <Building2 className="w-8 h-8" style={{ color: THEME.primary }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 truncate group-hover:text-primary transition-colors">
                        {org.name}
                      </h3>
                      <p className="text-sm text-gray-500">マーダーミステリー専門店</p>
                    </div>
                  </div>

                  {/* アクション */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Link
                      to={`/${org.slug}`}
                      className="flex-1 py-2 text-center text-sm font-medium text-white transition-colors hover:opacity-90 flex items-center justify-center gap-2"
                      style={{ backgroundColor: THEME.primary }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      予約サイトを見る
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 掲載のお問い合わせ */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            MMQへの掲載について
          </h2>
          <p className="text-gray-600 mb-6">
            マーダーミステリー店舗の運営者様で、MMQへの掲載をご希望の方は<br />
            お気軽にお問い合わせください。
          </p>
          <Link to="/contact">
            <button
              className="px-8 py-3 text-white font-semibold transition-colors hover:opacity-90"
              style={{ backgroundColor: THEME.primary }}
            >
              お問い合わせ
            </button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}
