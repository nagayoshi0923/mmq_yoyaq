import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

export function GmHistoryPage() {
  const { user } = useAuth()
  const [playedScenarios, setPlayedScenarios] = useState<any[]>([])
  const [staffInfo, setStaffInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.email) {
      fetchStaffInfo()
    }
  }, [user])

  useEffect(() => {
    if (staffInfo?.id) {
      fetchPlayedScenarios()
    }
  }, [staffInfo])

  const fetchStaffInfo = async () => {
    if (!user?.email) return

    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      if (error) throw error
      setStaffInfo(data)
    } catch (error) {
      logger.error('スタッフ情報取得エラー:', error)
    }
  }

  const fetchPlayedScenarios = async () => {
    if (!staffInfo?.name) return

    setLoading(true)
    try {
      // スタッフが担当した公演を取得
      const { data, error } = await supabase
        .from('schedule_events')
        .select('scenario, date, venue')
        .contains('gms', [staffInfo.name])
        .eq('is_cancelled', false)
        .lte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: false })

      if (error) throw error

      // シナリオごとにグループ化してカウント
      const scenarioMap = new Map()
      data?.forEach((event) => {
        const count = scenarioMap.get(event.scenario) || 0
        scenarioMap.set(event.scenario, count + 1)
      })

      const scenarios = Array.from(scenarioMap.entries()).map(([scenario, count]) => ({
        scenario,
        count,
      }))

      setPlayedScenarios(scenarios)
    } catch (error) {
      logger.error('プレイ済みシナリオ取得エラー:', error)
    } finally {
      setLoading(false)
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

  if (!staffInfo) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            スタッフ情報が見つかりません
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            GMとして担当したシナリオ ({playedScenarios.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {playedScenarios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              担当したシナリオがありません
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {playedScenarios.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{item.scenario}</span>
                  <Badge variant="secondary" className="text-base">
                    {item.count}回
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>統計情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-lg font-bold text-primary">
                {playedScenarios.reduce((sum, item) => sum + item.count, 0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">総公演数</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-lg font-bold text-primary">{playedScenarios.length}</div>
              <div className="text-sm text-muted-foreground mt-1">担当シナリオ数</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-lg font-bold text-primary">
                {staffInfo.experience || 0}
              </div>
              <div className="text-sm text-muted-foreground mt-1">経験値</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

