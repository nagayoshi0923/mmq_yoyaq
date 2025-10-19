import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, Users, Star, Edit, Trash2 } from 'lucide-react'
import type { Scenario } from '@/types'
import { 
  formatDuration, 
  formatPlayerCount, 
  formatParticipationFee,
  getStatusLabel,
  getDifficultyStars,
  getDisplayGMs
} from '../utils/scenarioFormatters'

interface ScenarioTableRowProps {
  scenario: Scenario
  displayMode: 'compact' | 'detailed'
  onEdit: (scenario: Scenario) => void
  onDelete: (scenario: Scenario) => void
}

/**
 * シナリオテーブルの行コンポーネント（再利用可能）
 */
export const ScenarioTableRow: React.FC<ScenarioTableRowProps> = ({
  scenario,
  displayMode,
  onEdit,
  onDelete
}) => {
  const { displayed: displayedGMs, remaining: remainingGMs } = getDisplayGMs(scenario.available_gms || [])
  
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center min-h-[60px]">
          {/* タイトル */}
          <div className="flex-shrink-0 w-40 px-3 py-2 border-r">
            <p className="font-medium text-sm truncate" title={scenario.title}>
              {scenario.title}
            </p>
          </div>

          {/* 作者 */}
          <div className="flex-shrink-0 w-32 px-3 py-2 border-r">
            <p className="text-sm truncate" title={scenario.author}>
              {scenario.author}
            </p>
          </div>

          {/* 所要時間 */}
          <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
            <p className="text-sm flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatDuration(scenario.duration)}
            </p>
          </div>

          {/* 人数 */}
          <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
            <p className="text-sm flex items-center gap-1">
              <Users className="h-3 w-3" /> 
              {formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}
            </p>
          </div>

          {/* 担当GM（基本情報時のみ） */}
          {displayMode === 'compact' && (
            <div className="flex-shrink-0 w-96 px-3 py-2 border-r">
              <div className="text-sm">
                {displayedGMs.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {displayedGMs.map((gm, i) => (
                      <Badge key={i} variant="outline" className="font-normal text-xs px-1 py-0.5">
                        {gm}
                      </Badge>
                    ))}
                    {remainingGMs > 0 && (
                      <Badge variant="outline" className="font-normal text-xs px-1 py-0.5">
                        +{remainingGMs}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">未設定</span>
                )}
              </div>
            </div>
          )}

          {/* 管理情報（詳細表示時のみ） */}
          {displayMode === 'detailed' && (
            <>
              {/* 難易度 */}
              <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      className={`h-3 w-3 ${i < getDifficultyStars(scenario.difficulty) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} 
                    />
                  ))}
                </div>
              </div>

              {/* ライセンス料 */}
              <div className="flex-shrink-0 w-28 px-3 py-2 border-r">
                {(() => {
                  const normalLicense = scenario.license_amount || 0
                  const gmTestLicense = scenario.gm_test_license_amount || 0
                  
                  if (normalLicense === 0 && gmTestLicense === 0) {
                    return <p className="text-sm text-right text-muted-foreground">¥0</p>
                  }
                  
                  return (
                    <div className="text-xs space-y-0.5">
                      <p className="text-right">
                        通常: ¥{normalLicense.toLocaleString()}
                      </p>
                      <p className="text-right text-muted-foreground">
                        GMテスト: ¥{gmTestLicense.toLocaleString()}
                      </p>
                    </div>
                  )
                })()}
              </div>
            </>
          )}

          {/* 参加費 */}
          <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
            <p className="text-sm text-right">
              {formatParticipationFee(scenario.participation_fee || 0)}
            </p>
          </div>

          {/* ステータス */}
          <div className="flex-shrink-0 w-28 px-3 py-2 border-r">
            <Badge className={
              scenario.status === 'available' ? 'bg-green-100 text-green-800 px-1 py-0.5' :
              scenario.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800 px-1 py-0.5' :
              'bg-red-100 text-red-800 px-1 py-0.5'
            }>
              {getStatusLabel(scenario.status)}
            </Badge>
          </div>

          {/* ジャンル（詳細表示時のみ） */}
          {displayMode === 'detailed' && (
            <div className="flex-1 px-3 py-2 border-r min-w-0">
              {scenario.genre && scenario.genre.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {scenario.genre.slice(0, 2).map((g, i) => (
                    <Badge key={i} variant="outline" className="font-normal text-xs px-1 py-0.5">
                      {g}
                    </Badge>
                  ))}
                  {scenario.genre.length > 2 && (
                    <Badge variant="outline" className="font-normal text-xs px-1 py-0.5">
                      +{scenario.genre.length - 2}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )}

          {/* アクション */}
          <div className="flex-shrink-0 w-24 px-3 py-2">
            <div className="flex gap-1 justify-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                title="編集"
                onClick={() => onEdit(scenario)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="削除"
                onClick={() => onDelete(scenario)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

