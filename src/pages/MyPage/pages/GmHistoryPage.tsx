import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useStaffInfoQuery, useGmPlayedScenariosQuery } from '../hooks/useGmHistoryQuery'

export function GmHistoryPage() {
  const { user } = useAuth()

  const { data: staffInfo, isLoading: staffLoading } = useStaffInfoQuery(user?.email)
  const { data: playedScenarios = [], isLoading: scenariosLoading } = useGmPlayedScenariosQuery(staffInfo?.name)

  const loading = staffLoading || scenariosLoading

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
                  <span className="">{item.scenario}</span>
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
              <div className="text-lg text-primary">
                {playedScenarios.reduce((sum, item) => sum + item.count, 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">総公演数</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-lg text-primary">{playedScenarios.length}</div>
              <div className="text-xs text-muted-foreground mt-1">担当シナリオ数</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-lg text-primary">
                {staffInfo.experience || 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">経験値</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
