import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, Users, Star, ExternalLink } from 'lucide-react'
import type { ScenarioDetail } from '../utils/types'

interface ScenarioHeroProps {
  scenario: ScenarioDetail
}

/**
 * シナリオヒーローセクション（キービジュアル + タイトル + 基本情報）
 */
export const ScenarioHero: React.FC<ScenarioHeroProps> = ({ scenario }) => {
  return (
    <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* キービジュアル */}
          <div className="lg:col-span-4">
            <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg overflow-hidden shadow-2xl">
              {scenario.key_visual_url ? (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.scenario_title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <div className="text-center p-8">
                    <p className="font-bold text-2xl">{scenario.scenario_title}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* タイトル・基本情報 */}
          <div className="lg:col-span-8 space-y-4">
            <div>
              <p className="text-sm opacity-80 mb-1">{scenario.author}</p>
              <h1 className="text-3xl font-bold mb-3">{scenario.scenario_title}</h1>
              
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full text-sm">
                  <Users className="w-4 h-4" />
                  <span className="font-medium">{scenario.player_count_min}〜{scenario.player_count_max}人</span>
                </div>
                
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full text-sm">
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">{(scenario.duration / 60).toFixed(1)}h</span>
                </div>
                
                {scenario.rating && (
                  <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full text-sm">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium">{scenario.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>

            {scenario.description && (
              <p className="opacity-90 leading-relaxed">
                {scenario.description}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {scenario.genre.map((g, i) => (
                <Badge key={i} variant="outline" className="bg-white/20 text-white border-white/30 text-xs px-2 py-0.5 rounded-sm">
                  {g}
                </Badge>
              ))}
              {scenario.has_pre_reading && (
                <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs px-2 py-0.5 rounded-sm">
                  事前読解あり
                </Badge>
              )}
            </div>

            <div className="flex gap-2">
              {scenario.official_site_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/10 border-white/30 text-white hover:bg-white/20 h-8 text-sm"
                  onClick={() => window.open(scenario.official_site_url, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  公式サイト
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

