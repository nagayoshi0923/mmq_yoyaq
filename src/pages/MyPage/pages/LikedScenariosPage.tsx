import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Heart, Users, Clock, Sparkles, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

interface WantToPlayScenario {
  id: string
  scenario_id: string
  created_at: string
  scenario: {
    id: string
    slug?: string  // URL用のslug（あればこちらを使用）
    title: string
    description: string
    author: string
    duration: number
    player_count_min: number
    player_count_max: number
    difficulty: number
    genre: string[]
    rating: number
    play_count: number
    key_visual_url?: string
  }
}

export function WantToPlayPage() {
  const { user } = useAuth()
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const [wantToPlayScenarios, setWantToPlayScenarios] = useState<WantToPlayScenario[]>([])
  const [loading, setLoading] = useState(true)
  
  // 予約サイトのベースパス
  const bookingBasePath = organization?.slug ? `/${organization.slug}` : '/queens-waltz'

  useEffect(() => {
    if (user?.id) {
      fetchWantToPlayScenarios()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user変更時のみ実行
  }, [user])

  const fetchWantToPlayScenarios = async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      // 顧客情報を取得（user_idで検索）
      logger.log('[WantToPlayPage] Looking for customer with user_id:', user.id)
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      
      logger.log('[WantToPlayPage] Customer search result:', customer, 'error:', customerError)

      if (customerError) throw customerError
      if (!customer) {
        setWantToPlayScenarios([])
        setLoading(false)
        return
      }

      // 遊びたいシナリオを取得
      logger.log('[WantToPlayPage] Fetching scenario_likes for customer_id:', customer.id)
      const { data: likesData, error: likesError } = await supabase
        .from('scenario_likes')
        .select('id, scenario_id, scenario_master_id, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })

      logger.log('[WantToPlayPage] Likes data:', likesData, 'error:', likesError)
      if (likesError) throw likesError
      if (!likesData || likesData.length === 0) {
        logger.log('[WantToPlayPage] No likes found')
        setWantToPlayScenarios([])
        return
      }

      // シナリオ情報を取得（scenario_master_id を優先、scenario_masters から）
      const scenarioMasterIds = likesData.map(like => (like as { scenario_master_id?: string }).scenario_master_id ?? like.scenario_id).filter(Boolean)
      const { data: scenariosData, error: scenariosError } = await supabase
        .from('scenario_masters')
        .select('id, title, description, author, official_duration, player_count_min, player_count_max, difficulty, genre, key_visual_url')
        .in('id', scenarioMasterIds)

      if (scenariosError) throw scenariosError

      // データを結合
      const combined = likesData.map(like => {
        const masterId = (like as { scenario_master_id?: string }).scenario_master_id ?? like.scenario_id
        const scenario = scenariosData?.find(s => s.id === masterId)
        return {
          id: like.id,
          scenario_id: like.scenario_id,
          created_at: like.created_at,
          scenario: scenario ? {
            ...scenario,
            duration: (scenario as { official_duration?: number }).official_duration ?? 0,
            slug: scenario.id,
            rating: 0,
            play_count: 0,
          } : {
            id: masterId ?? like.scenario_id,
            slug: masterId ?? like.scenario_id,
            title: '不明',
            description: '',
            author: '',
            duration: 0,
            player_count_min: 0,
            player_count_max: 0,
            difficulty: 0,
            genre: [],
            rating: 0,
            play_count: 0,
          }
        }
      })

      setWantToPlayScenarios(combined)
    } catch (error) {
      logger.error('遊びたいシナリオ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (likeId: string) => {
    try {
      const { error } = await supabase
        .from('scenario_likes')
        .delete()
        .eq('id', likeId)

      if (error) throw error

      // ローカルステートを更新
      setWantToPlayScenarios((prev) => prev.filter((item) => item.id !== likeId))
    } catch (error) {
      logger.error('削除エラー:', error)
      showToast.error('削除に失敗しました')
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  const getDifficultyLabel = (difficulty: number) => {
    switch (difficulty) {
      case 1:
        return '初級'
      case 2:
        return '中級'
      case 3:
        return '上級'
      case 4:
        return '最上級'
      case 5:
        return '超上級'
      default:
        return '不明'
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">読み込み中...</div>
    )
  }

  if (wantToPlayScenarios.length === 0) {
    return (
      <div className="bg-white shadow-sm p-8 text-center border border-gray-200" style={{ borderRadius: 0 }}>
        <div 
          className="w-16 h-16 flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
        >
          <Heart className="w-8 h-8" style={{ color: THEME.primary }} />
        </div>
        <h3 className="font-bold text-gray-900 mb-2">遊びたいリスト</h3>
        <p className="text-gray-500 text-sm mb-6">
          気になるシナリオをお気に入りに追加して<br />
          公演情報をチェックしましょう
        </p>
        <Button 
          className="text-white px-8"
          style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
          onClick={() => navigate('/')}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          シナリオを探す
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-4">
        <Heart className="w-5 h-5" style={{ color: THEME.primary }} />
        <h2 className="font-bold text-gray-900">遊びたいシナリオ ({wantToPlayScenarios.length})</h2>
      </div>

      {/* シナリオリスト */}
      {wantToPlayScenarios.map((item) => (
        <div
          key={item.id}
          className="bg-white shadow-sm p-4 hover:shadow-md transition-all duration-300 cursor-pointer border border-gray-200 hover:border-gray-300"
          style={{ borderRadius: 0 }}
          onClick={() => {
            navigate(`${bookingBasePath}/scenario/${item.scenario.slug || item.scenario.id}`)
          }}
        >
          <div className="flex gap-4">
            {/* シナリオ画像 - blur背景で画像が途切れないように */}
            <div className="flex-shrink-0 w-20 h-28 bg-gray-900 overflow-hidden relative" style={{ borderRadius: 0 }}>
              {item.scenario.key_visual_url ? (
                <>
                  {/* 背景：ぼかした画像で余白を埋める */}
                  <div 
                    className="absolute inset-0 scale-110"
                    style={{
                      backgroundImage: `url(${item.scenario.key_visual_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      filter: 'blur(10px) brightness(0.7)',
                    }}
                  />
                  {/* メイン画像：全体を表示 */}
                  <img
                    src={item.scenario.key_visual_url}
                    alt={item.scenario.title}
                    className="relative w-full h-full object-contain"
                    loading="lazy"
                  />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎭</div>
              )}
            </div>

            {/* コンテンツ */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 truncate">{item.scenario.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">作者: {item.scenario.author}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(item.id)
                  }}
                  className="flex-shrink-0 hover:bg-red-50"
                  title="お気に入りから削除"
                >
                  <Heart className="h-5 w-5 fill-current" style={{ color: THEME.primary }} />
                </Button>
              </div>

              {/* タグ情報 */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  <Users className="w-3 h-3 mr-1" />
                  {item.scenario.player_count_min === item.scenario.player_count_max
                    ? `${item.scenario.player_count_max}人`
                    : `${item.scenario.player_count_min}〜${item.scenario.player_count_max}人`}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {Math.floor(item.scenario.duration / 60)}h{item.scenario.duration % 60 > 0 ? `${item.scenario.duration % 60}m` : ''}
                </Badge>
                {item.scenario.difficulty >= 1 && item.scenario.difficulty <= 5 && (
                  <Badge variant="outline" className="text-xs">
                    {getDifficultyLabel(item.scenario.difficulty)}
                  </Badge>
                )}
              </div>

              {/* 追加日 */}
              <p className="text-xs text-gray-400 mt-2">追加日: {formatDate(item.created_at)}</p>
            </div>

            {/* 右矢印 */}
            <div className="flex items-center">
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

