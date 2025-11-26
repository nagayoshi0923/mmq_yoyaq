import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Users, Star, ExternalLink } from 'lucide-react'
import type { ScenarioDetail } from '../utils/types'
import { formatDuration, formatPlayerCount, formatParticipationFee, getDifficultyStars } from '../utils/formatters'

interface ScenarioInfoProps {
  scenario: ScenarioDetail
}

/**
 * シナリオ情報表示コンポーネント
 */
export const ScenarioInfo: React.FC<ScenarioInfoProps> = ({ scenario }) => {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {/* キービジュアル */}
          {scenario.key_visual_url && (
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
              <img 
                src={scenario.key_visual_url} 
                alt={scenario.scenario_title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* 基本情報 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">プレイ時間</div>
                <div className="">{formatDuration(scenario.duration)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">プレイ人数</div>
                <div className="">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">難易度</div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i} 
                    className={`h-4 w-4 ${i < getDifficultyStars(scenario.difficulty) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} 
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">参加費</div>
              <div className="text-lg">{formatParticipationFee(scenario.participation_fee)}</div>
            </div>
          </div>

          {/* ジャンル */}
          {scenario.genre && scenario.genre.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">ジャンル</div>
              <div className="flex flex-wrap gap-2">
                {scenario.genre.map((g, i) => (
                  <Badge key={i} variant="secondary" className="bg-gray-100 border-0 rounded-[2px] font-normal">{g}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* 作者 */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">作者</div>
            <div className="">{scenario.author}</div>
          </div>

          {/* あらすじ */}
          {scenario.synopsis && (
            <div>
              <div className="text-sm mb-2">あらすじ</div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{scenario.synopsis}</p>
            </div>
          )}

          {/* 事前読み込み */}
          {scenario.has_pre_reading && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <span className="">📖 このシナリオには事前読み込みがあります</span>
            </div>
          )}

          {/* 公式サイト */}
          {scenario.official_site_url && (
            <a 
              href={scenario.official_site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              公式サイトで詳しく見る
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

