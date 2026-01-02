import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Star, Users, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { OptimizedImage } from '@/components/ui/optimized-image'

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
  const [wantToPlayScenarios, setWantToPlayScenarios] = useState<WantToPlayScenario[]>([])
  const [loading, setLoading] = useState(true)
  
  // 予約サイトのベースパス
  const bookingBasePath = organization?.slug ? `/${organization.slug}` : '/queens-waltz'

  useEffect(() => {
    if (user?.email) {
      fetchWantToPlayScenarios()
    }
  }, [user])

  const fetchWantToPlayScenarios = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()

      if (customerError) throw customerError
      if (!customer) {
        setWantToPlayScenarios([])
        setLoading(false)
        return
      }

      // 遊びたいシナリオを取得
      const { data: likesData, error: likesError } = await supabase
        .from('scenario_likes')
        .select('id, scenario_id, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })

      if (likesError) throw likesError
      if (!likesData || likesData.length === 0) {
        setWantToPlayScenarios([])
        return
      }

      // シナリオ情報を取得
      const scenarioIds = likesData.map(like => like.scenario_id)
      const { data: scenariosData, error: scenariosError } = await supabase
        .from('scenarios')
        .select('id, slug, title, description, author, duration, player_count_min, player_count_max, difficulty, genre, rating, play_count, key_visual_url')
        .in('id', scenarioIds)

      if (scenariosError) throw scenariosError

      // データを結合
      const combined = likesData.map(like => {
        const scenario = scenariosData?.find(s => s.id === like.scenario_id)
        return {
          id: like.id,
          scenario_id: like.scenario_id,
          created_at: like.created_at,
          scenario: scenario || {
            id: like.scenario_id,
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
      <Card className="shadow-none border">
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-none border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            遊びたいシナリオ ({wantToPlayScenarios.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wantToPlayScenarios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              遊びたいシナリオがありません
            </div>
          ) : (
            <div className="space-y-4">
              {wantToPlayScenarios.map((item) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => {
                    window.location.href = `${bookingBasePath}/scenario/${item.scenario.slug || item.scenario.id}`
                  }}
                >
                  <div className="flex items-start gap-4 mb-3">
                    {/* シナリオ画像 */}
                    <div className="flex-shrink-0 w-16 h-20 bg-gray-200 rounded overflow-hidden">
                      {item.scenario.key_visual_url ? (
                        <OptimizedImage
                          src={item.scenario.key_visual_url}
                          alt={item.scenario.title}
                          className="w-full h-full object-cover"
                          responsive={true}
                          srcSetSizes={[64, 128, 256]}
                          breakpoints={{ mobile: 64, tablet: 80, desktop: 128 }}
                          useWebP={true}
                          quality={85}
                          fallback={
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                              No Image
                            </div>
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                          No Image
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="text-lg mb-1">{item.scenario.title}</h3>
                          <p className="text-xs text-muted-foreground mb-2">
                            作者: {item.scenario.author}
                          </p>
                          {item.scenario.description && (
                            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                              {item.scenario.description}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemove(item.id)
                          }}
                          className="hover:bg-red-50"
                          title="リストから削除"
                        >
                          <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {item.scenario.player_count_min === item.scenario.player_count_max
                          ? `${item.scenario.player_count_max}人`
                          : `${item.scenario.player_count_min}〜${item.scenario.player_count_max}人`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{item.scenario.duration}分</span>
                    </div>
                    {item.scenario.rating > 0 && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span>{item.scenario.rating.toFixed(1)}</span>
                      </div>
                    )}
                    <Badge variant="secondary">{getDifficultyLabel(item.scenario.difficulty)}</Badge>
                  </div>

                  {item.scenario.genre && item.scenario.genre.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {item.scenario.genre.map((g, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {g}
                        </Badge>
                      ))}
                    </div>
                  )}

                    <div className="text-xs text-muted-foreground">
                      追加日: {formatDate(item.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

