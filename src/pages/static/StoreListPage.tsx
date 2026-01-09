/**
 * 店舗一覧ページ
 * @path /stores
 */
import { useState, useEffect } from 'react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Building2, ChevronRight, MapPin, Clock, Phone, ExternalLink } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface Organization {
  id: string
  slug: string
  name: string
  logo_url?: string
}

interface Store {
  id: string
  name: string
  short_name: string
  address: string
  access_info?: string
  phone?: string
  business_hours?: string
  organization_id: string
  region?: string
  color?: string
}

interface StoreWithOrg extends Store {
  organization: Organization
}

export function StoreListPage() {
  const navigate = useNavigate()
  const [stores, setStores] = useState<StoreWithOrg[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState<string>('all')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      // 組織一覧を取得
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, slug, name, logo_url')
        .eq('is_active', true)
        .order('name')

      if (orgData) {
        setOrganizations(orgData)
      }

      // 店舗一覧を取得
      const { data: storeData } = await supabase
        .from('stores')
        .select(`
          id, name, short_name, address, access_info, phone, business_hours, organization_id, region, color,
          organizations!inner (id, slug, name, logo_url)
        `)
        .order('name')

      if (storeData) {
        const storesWithOrg = storeData.map((s: any) => ({
          ...s,
          organization: s.organizations
        }))
        setStores(storesWithOrg)
      }
    } catch (error) {
      console.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 地域リスト
  const regions = Array.from(new Set(stores.map(s => s.region).filter(Boolean))) as string[]

  // フィルタリング
  const filteredStores = selectedRegion === 'all' 
    ? stores 
    : stores.filter(s => s.region === selectedRegion)

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
            <span>店舗一覧</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Building2 className="w-8 h-8" />
            店舗一覧
          </h1>
          <p className="text-white/80 mt-2">
            マーダーミステリーを楽しめる店舗
          </p>
        </div>
      </section>

      {/* フィルター */}
      {regions.length > 0 && (
        <section className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-sm text-gray-500 flex-shrink-0">地域:</span>
              <button
                onClick={() => setSelectedRegion('all')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors flex-shrink-0 ${
                  selectedRegion === 'all'
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={selectedRegion === 'all' ? { backgroundColor: THEME.primary } : {}}
              >
                すべて
              </button>
              {regions.map(region => (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors flex-shrink-0 ${
                    selectedRegion === region
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={selectedRegion === region ? { backgroundColor: THEME.primary } : {}}
                >
                  {region}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 店舗リスト */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        {loading ? (
          <div className="flex justify-center py-12">
            <div 
              className="animate-spin h-8 w-8 border-4 border-t-transparent"
              style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }}
            />
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            該当する店舗がありません
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredStores.map(store => (
              <div 
                key={store.id}
                className="bg-white border border-gray-200 hover:shadow-lg transition-all group"
              >
                {/* 店舗カラーバー */}
                <div 
                  className="h-2"
                  style={{ backgroundColor: store.color || THEME.primary }}
                />
                
                <div className="p-6">
                  {/* 組織名 */}
                  <Link 
                    to={`/${store.organization.slug}`}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {store.organization.name}
                  </Link>
                  
                  {/* 店舗名 */}
                  <h3 className="text-lg font-bold text-gray-900 mt-1 mb-3">
                    {store.name}
                  </h3>

                  {/* 店舗情報 */}
                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    {store.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span>{store.address}</span>
                      </div>
                    )}
                    {store.access_info && (
                      <div className="flex items-start gap-2">
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-500">{store.access_info}</span>
                      </div>
                    )}
                    {store.business_hours && (
                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span>{store.business_hours}</span>
                      </div>
                    )}
                    {store.phone && (
                      <div className="flex items-start gap-2">
                        <Phone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span>{store.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* アクション */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Link
                      to={`/${store.organization.slug}`}
                      className="flex-1 py-2 text-center text-sm font-medium text-white transition-colors hover:opacity-90"
                      style={{ backgroundColor: THEME.primary }}
                    >
                      シナリオを見る
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 店舗掲載のお問い合わせ */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            MMQへの店舗掲載について
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

