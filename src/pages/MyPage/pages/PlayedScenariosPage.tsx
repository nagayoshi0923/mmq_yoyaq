import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Calendar, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  gms: string[]
}

export function PlayedScenariosPage() {
  const { user } = useAuth()
  const [playedScenarios, setPlayedScenarios] = useState<PlayedScenario[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.email) {
      fetchPlayedScenarios()
    }
  }, [user])

  const fetchPlayedScenarios = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, name')
        .eq('email', user.email)
        .maybeSingle()

      if (customerError) throw customerError
      if (!customer) {
        setPlayedScenarios([])
        setLoading(false)
        return
      }

      // 予約を取得
      const { data: reservations, error: reservationsError } = await supabase
        .from('reservations')
        .select('requested_datetime, title')
        .eq('customer_id', customer.id)
        .eq('status', 'confirmed')
        .lte('requested_datetime', new Date().toISOString())
        .order('requested_datetime', { ascending: false })

      if (reservationsError) throw reservationsError

      // 予約から日時とタイトルを取得し、スケジュールイベントと照合
      const scenarios: PlayedScenario[] = []
      
      if (reservations) {
        for (const reservation of reservations) {
          const reservationDate = new Date(reservation.requested_datetime)
          const dateStr = reservationDate.toISOString().split('T')[0]
          
          // スケジュールイベントを検索
          const { data: event, error: eventError } = await supabase
            .from('schedule_events')
            .select('scenario, date, venue, gms')
            .eq('date', dateStr)
            .eq('scenario', reservation.title)
            .maybeSingle()

          if (!eventError && event) {
            scenarios.push({
              scenario: event.scenario,
              date: event.date,
              venue: event.venue,
              gms: event.gms || [],
            })
          } else {
            // イベントが見つからない場合でも予約情報から追加
            scenarios.push({
              scenario: reservation.title,
              date: dateStr,
              venue: '店舗不明',
              gms: [],
            })
          }
        }
      }

      setPlayedScenarios(scenarios)
    } catch (error) {
      logger.error('プレイ済みシナリオ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  // シナリオごとにグループ化
  const scenarioGroups = playedScenarios.reduce((acc, item) => {
    const existing = acc.find((g) => g.scenario === item.scenario)
    if (existing) {
      existing.plays.push(item)
      existing.count++
    } else {
      acc.push({
        scenario: item.scenario,
        count: 1,
        plays: [item],
      })
    }
    return acc
  }, [] as Array<{ scenario: string; count: number; plays: PlayedScenario[] }>)

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
      {/* 統計 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-primary">{playedScenarios.length}</div>
            <div className="text-sm text-muted-foreground mt-1">総プレイ回数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-primary">{scenarioGroups.length}</div>
            <div className="text-sm text-muted-foreground mt-1">プレイしたシナリオ</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-primary">
              {scenarioGroups.filter((g) => g.count > 1).length}
            </div>
            <div className="text-sm text-muted-foreground mt-1">リピートシナリオ</div>
          </CardContent>
        </Card>
      </div>

      {/* シナリオリスト */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            プレイ済みシナリオ一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scenarioGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              プレイ履歴がありません
            </div>
          ) : (
            <div className="space-y-4">
              {scenarioGroups.map((group, idx) => (
                <div key={idx} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-lg">{group.scenario}</h3>
                    <Badge variant="secondary" className="text-sm">
                      {group.count}回プレイ
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {group.plays.map((play, playIdx) => (
                      <div
                        key={playIdx}
                        className="flex items-center gap-4 text-sm text-muted-foreground bg-muted/30 p-2 rounded"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(play.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span>{play.venue}</span>
                        </div>
                        {play.gms.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs">GM:</span>
                            <div className="flex gap-1">
                              {play.gms.map((gm, gmIdx) => (
                                <Badge key={gmIdx} variant="outline" className="text-xs">
                                  {gm}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
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

