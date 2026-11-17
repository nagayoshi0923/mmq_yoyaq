import { memo, useState } from 'react'
import { User } from 'lucide-react'
import type { ScenarioDetail, ScenarioCharacter } from '../utils/types'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { SensitivityCheck } from '@/components/scenario/SensitivityCheck'
import { characterImageStyle } from '@/components/scenario/scenarioFacts'

interface ScenarioAboutProps {
  scenario: ScenarioDetail
  stores?: { id: string; name: string; short_name?: string }[]
}

// 性別の表示ラベル
const genderLabel: Record<ScenarioCharacter['gender'], string> = {
  male: '男性',
  female: '女性',
  any: '性別自由',
  other: 'その他',
  unknown: '',
}

// キャラクターカード（画像・名前・性別と年齢。説明は「すべて見る」で開いたときだけ）
function CharacterCard({ character, withDescription }: { character: ScenarioCharacter; withDescription: boolean }) {
  return (
    <div className="min-w-0">
      <div className="relative aspect-[4/3] overflow-hidden" style={{ backgroundColor: character.background_color || '#e5e7eb' }}>
        {character.image_url ? (
          <OptimizedImage
            src={character.image_url}
            alt={character.name}
            className="h-full w-full object-cover"
            style={characterImageStyle(character.image_position, character.image_scale)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><User className="h-8 w-8 text-gray-400" /></div>
        )}
        {character.is_npc && <span className="absolute left-1 top-1 bg-amber-400 px-1 text-[10px] font-bold text-amber-900">NPC</span>}
      </div>
      <p className="mt-1.5 truncate text-sm font-bold">{character.name}</p>
      <p className="truncate text-[11px] text-muted-foreground">
        {[genderLabel[character.gender], character.age, character.occupation].filter(Boolean).join('・')}
      </p>
      {withDescription && character.description && (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700">{character.description}</p>
      )}
    </div>
  )
}

export const ScenarioAbout = memo(function ScenarioAbout({ scenario }: ScenarioAboutProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const shouldTruncate = (scenario.synopsis?.length || 0) > 200
  const characters = [...(scenario.characters ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div>
      {scenario.synopsis && (
        <section className="border-t border-gray-200 px-4 py-6">
          <h2 className="text-lg font-bold">あらすじ</h2>
          <p className={`mt-3 whitespace-pre-wrap text-sm leading-relaxed ${!isExpanded && shouldTruncate ? 'line-clamp-5' : ''}`}>
            {scenario.synopsis}
          </p>
          {shouldTruncate && (
            <button type="button" onClick={() => setIsExpanded((v) => !v)} className="mt-2 text-sm underline underline-offset-4">
              {isExpanded ? '閉じる' : '続きを読む'}
            </button>
          )}
        </section>
      )}

      {characters.length > 0 && (
        <section className="border-t border-gray-200 px-4 py-6">
          <h2 className="text-lg font-bold">キャラクター</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {(showAll ? characters : characters.slice(0, 3)).map((c) => (
              <CharacterCard key={c.id} character={c} withDescription={showAll} />
            ))}
          </div>
          {(characters.length > 3 || characters.some((c) => c.description)) && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm underline underline-offset-4">
              {showAll ? '閉じる' : `${characters.length}人すべて見る`}
            </button>
          )}
        </section>
      )}

      {scenario.caution && (
        <section className="border-t border-gray-200 px-4 py-6">
          <h2 className="text-lg font-bold">この作品の特記事項</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{scenario.caution}</p>
        </section>
      )}

      {/* センシティブ内容セルフチェック（未申告作品では非表示） */}
      <div className="px-4 empty:hidden">
        <SensitivityCheck sensitiveTags={scenario.sensitive_tags || []} />
      </div>
    </div>
  )
})
