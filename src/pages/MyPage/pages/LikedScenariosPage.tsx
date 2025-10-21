import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Heart, Users, Clock, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

interface LikedScenario {
  id: string
  scenario_id: string
  created_at: string
  scenario: {
    id: string
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
  }
}

export function LikedScenariosPage() {
  const { user } = useAuth()
  const [likedScenarios, setLikedScenarios] = useState<LikedScenario[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.email) {
      fetchLikedScenarios()
    }
  }, [user])

  const fetchLikedScenarios = async () => {
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
        setLikedScenarios([])
        setLoading(false)
        return
      }

      // いいねしたシナリオを取得
      const { data, error } = await supabase
        .from('scenario_likes')
        .select(`
          id,
          scenario_id,
          created_at,
          scenario:scenarios (
            id,
            title,
            description,
            author,
            duration,
            player_count_min,
            player_count_max,
            difficulty,
            genre,
            rating,
            play_count
          )
        `)
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setLikedScenarios(data || [])
    } catch (error) {
      logger.error('いいねシナリオ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUnlike = async (likeId: string) => {
    try {
      const { error } = await supabase
        .from('scenario_likes')
        .delete()
        .eq('id', likeId)

      if (error) throw error

      // ローカルステートを更新
      setLikedScenarios((prev) => prev.filter((item) => item.id !== likeId))
    } catch (error) {
      logger.error('いいね解除エラー:', error)
      alert('いいねの解除に失敗しました')
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
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 fill-red-500 text-red-500" />
            いいねしたシナリオ ({likedScenarios.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {likedScenarios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              いいねしたシナリオがありません
            </div>
          ) : (
            <div className="space-y-4">
              {likedScenarios.map((item) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg mb-1">{item.scenario.title}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        作者: {item.scenario.author}
                      </p>
                      {item.scenario.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {item.scenario.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUnlike(item.id)}
                      className="hover:bg-red-50"
                    >
                      <Heart className="h-5 w-5 fill-red-500 text-red-500" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {item.scenario.player_count_min}〜{item.scenario.player_count_max}人
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
                    いいねした日: {formatDate(item.created_at)}
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

