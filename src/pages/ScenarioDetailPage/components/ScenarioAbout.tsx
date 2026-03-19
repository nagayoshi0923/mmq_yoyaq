import { memo, useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Users, ChevronDown, BookOpen, AlertTriangle, UserCircle, Building2, User } from 'lucide-react'
import type { ScenarioDetail, ScenarioCharacter } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface Store {
  id: string
  name: string
  short_name?: string
}

interface ScenarioAboutProps {
  scenario: ScenarioDetail
  stores?: Store[]
}

// 男女比の表示文字列を生成
function formatGenderRatio(male?: number | null, female?: number | null, other?: number | null): string | null {
  const parts: string[] = []
  if (male != null) parts.push(`男性${male}人`)
  if (female != null) parts.push(`女性${female}人`)
  if (other != null) parts.push(`その他${other}人`)
  return parts.length > 0 ? parts.join(' / ') : null
}

// 性別の表示ラベル
const genderLabel: Record<ScenarioCharacter['gender'], string> = {
  male: '男性',
  female: '女性',
  any: '性別自由',
  other: 'その他',
  unknown: '',
}

// キャラクターカード
function CharacterCard({ character }: { character: ScenarioCharacter }) {
  const isNpc = character.is_npc
  return (
    <div
      className={`relative overflow-hidden ${isNpc ? 'ring-2 ring-amber-300' : ''}`}
      style={{ borderRadius: 0 }}
    >
      {/* キャラクター画像（全面） */}
      {character.image_url ? (
        <div
          className="w-full aspect-[3/4] overflow-hidden"
          style={{ backgroundColor: character.background_color || '#e5e7eb' }}
        >
          <OptimizedImage
            src={character.image_url}
            alt={character.name}
            className="w-full h-full object-cover"
            style={{
              objectPosition: character.image_position
                ? (character.image_position.includes(' ')
                    ? `${character.image_position.split(' ')[0]}% ${character.image_position.split(' ')[1]}%`
                    : `center ${character.image_position}`)
                : '50% 50%'
            }}
          />
        </div>
      ) : (
        <div className="w-full aspect-[3/4] bg-gray-200 flex items-center justify-center">
          <User className="w-10 h-10 text-gray-400" />
        </div>
      )}

      {/* NPC バッジ（左上） */}
      {isNpc && (
        <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-sm shadow">
          NPC
        </span>
      )}

      {/* テキストオーバーレイ（下部グラデーション） */}
        <div
        className="absolute bottom-0 left-0 right-0 px-2 pt-6 pb-2"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)' }}
      >
        <p className="font-semibold text-white text-xs leading-tight drop-shadow">
          {character.name}
          {character.first_person && (
            <span className="ml-1 font-normal text-white/70">（{character.first_person}）</span>
          )}
        </p>
        <div className="text-[10px] text-white/80 mt-0.5 leading-tight">
          {(character.gender !== 'unknown' || character.age) && (
            <p>
              {genderLabel[character.gender]}
              {character.gender !== 'unknown' && character.age && ' / '}
              {character.age}
            </p>
          )}
          {character.occupation && <p>{character.occupation}</p>}
        </div>
        {character.description && (
          <p className="text-[10px] text-white/70 mt-1 leading-snug line-clamp-2">
            {character.description}
          </p>
        )}
      </div>
    </div>
  )
}

export const ScenarioAbout = memo(function ScenarioAbout({ scenario, stores = [] }: ScenarioAboutProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const synopsisLength = scenario.synopsis?.length || 0
  const shouldTruncate = synopsisLength > 200
  
  // 男女比が設定されているかどうか
  const hasGenderRatio = scenario.male_count != null || scenario.female_count != null || scenario.other_count != null
  const genderRatioText = formatGenderRatio(scenario.male_count, scenario.female_count, scenario.other_count)
  
  // 公演可能店舗名を取得
  const availableStoreNames = useMemo(() => {
    if (!scenario.available_stores || scenario.available_stores.length === 0) return []
    const storeMap = new Map(stores.map(s => [s.id, s.short_name || s.name]))
    return scenario.available_stores
      .map(id => storeMap.get(id))
      .filter((name): name is string => !!name)
  }, [scenario.available_stores, stores])

  return (
    <div className="space-y-4">
      {/* あらすじセクション */}
      {scenario.synopsis && (
        <div className="bg-gray-50 border border-gray-200">
          <div 
            className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
            style={{ backgroundColor: THEME.primary }}
          >
            <BookOpen className="w-4 h-4 text-white" />
            <h3 className="font-semibold text-white text-sm">あらすじ</h3>
          </div>
          <div className="p-4">
            <div className={`relative ${!isExpanded && shouldTruncate ? 'max-h-32 overflow-hidden' : ''}`}>
              <p className="leading-relaxed whitespace-pre-wrap text-sm text-gray-700">
                {scenario.synopsis}
              </p>
              {/* グラデーションオーバーレイ */}
              {!isExpanded && shouldTruncate && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-50 to-transparent" />
              )}
            </div>
            {shouldTruncate && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 flex items-center gap-1 text-sm font-medium transition-colors"
                style={{ color: THEME.primary }}
              >
                {isExpanded ? '閉じる' : '続きを読む'}
                <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* キャラクターセクション */}
      {scenario.characters && scenario.characters.length > 0 && (
        <div className="bg-white border border-gray-200">
          <div 
            className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
            style={{ backgroundColor: THEME.primary }}
          >
            <Users className="w-4 h-4 text-white" />
            <h3 className="font-semibold text-white text-sm">キャラクター</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {scenario.characters
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((character) => (
                  <CharacterCard key={character.id} character={character} />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 注意事項セクション */}
      {scenario.caution && (
        <div className="bg-white border border-gray-200 rounded">
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-200">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <h3 className="font-semibold text-gray-900 text-sm">シナリオ特記事項</h3>
          </div>
          <div className="px-4 py-3">
            <p className="leading-relaxed whitespace-pre-wrap text-sm text-gray-700">
              {scenario.caution}
            </p>
          </div>
        </div>
      )}

      {/* 基本情報 */}
      <div className="bg-white border border-gray-200 p-4">
        <h4 className="font-semibold text-gray-900 mb-3 text-sm">シナリオ情報</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <div>
              <span className="text-gray-500 text-xs">プレイ人数</span>
              <p className="font-medium text-gray-900">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div>
              <span className="text-gray-500 text-xs">プレイ時間</span>
              <p className="font-medium text-gray-900">{formatDuration(scenario.duration, 'minutes')}</p>
            </div>
          </div>
          {hasGenderRatio && (
            <div className="flex items-center gap-2 col-span-2">
              <UserCircle className="w-4 h-4 text-gray-400" />
              <div>
                <span className="text-gray-500 text-xs">男女比</span>
                <p className="font-medium text-gray-900">{genderRatioText}</p>
              </div>
            </div>
          )}
          {availableStoreNames.length > 0 && (
            <div className="flex items-start gap-2 col-span-2">
              <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <span className="text-gray-500 text-xs">公演可能店舗</span>
                <p className="font-medium text-gray-900">{availableStoreNames.join('・')}</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
          {scenario.genre.map((g, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {g}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
})

