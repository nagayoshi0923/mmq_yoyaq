import { memo, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ShieldQuestion } from 'lucide-react'
import { SENSITIVE_TOPICS, SENSITIVITY_DISCLAIMER } from '@/constants/sensitiveTopics'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'

interface SensitivityCheckProps {
  /** この作品に含まれると申告されたセンシティブ項目キー */
  sensitiveTags: string[]
}

/**
 * センシティブ内容セルフチェック
 *
 * お客さんが「自分が避けたい項目」を選び、その作品に該当描写が含まれるか否かだけを表示する。
 * - 判定はクライアント内で完結（DB書き込み・API呼び出しは一切しない）
 * - 該当した項目名は表示しない（ネタバレ防止）
 * - 未申告作品（sensitiveTags が空）はセクション自体を出さない（誤った安心を与えないため）
 */
export const SensitivityCheck = memo(function SensitivityCheck({ sensitiveTags }: SensitivityCheckProps) {
  const preset = useOrgThemePreset()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  if (sensitiveTags.length === 0) return null

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // 申告タグと選択項目の積集合が空かどうかだけで分岐する（該当項目名は表示しない）
  const hasMatch = sensitiveTags.some((tag) => selected.has(tag))

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="w-full px-4 py-2.5 flex items-center gap-2 border border-gray-200 rounded text-left transition-colors hover:bg-gray-50"
      >
        <ShieldQuestion className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="ts-body">センシティブ内容をセルフチェックする</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground ml-auto shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-4 space-y-3">
          {!submitted ? (
            <>
              <p className="ts-caption">
                あなたが避けたい項目を選んで診断すると、この作品に該当する描写が含まれるかを確認できます。
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {SENSITIVE_TOPICS.map((topic) => {
                  const isSelected = selected.has(topic.key)
                  return (
                    <button
                      key={topic.key}
                      type="button"
                      onClick={() => toggle(topic.key)}
                      aria-pressed={isSelected}
                      className="flex items-start gap-1.5 px-2 py-1.5 border text-left transition-colors"
                      style={
                        isSelected
                          ? { backgroundColor: preset.primaryLight, borderColor: preset.primary }
                          : undefined
                      }
                    >
                      <span className="w-3.5 shrink-0 pt-0.5">
                        {isSelected && <Check className="w-3.5 h-3.5" style={{ color: preset.primary }} />}
                      </span>
                      <span className="text-xs">{topic.label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="flex">
                <button
                  type="button"
                  onClick={() => setSubmitted(true)}
                  disabled={selected.size === 0}
                  className="ml-auto px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: preset.primary, color: preset.onPrimary }}
                >
                  診断する
                </button>
              </div>

              <p className="ts-caption">{SENSITIVITY_DISCLAIMER}</p>
            </>
          ) : (
            <>
              {hasMatch ? (
                <div className="bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold">該当する描写が含まれています</p>
                  </div>
                  <p className="ts-caption">
                    あなたが選択された項目に該当する描写が、この作品には含まれています。ご不安な場合は、ご予約前にお問い合わせください。
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-xs font-semibold">選択された項目は含まれていません</p>
                  </div>
                  <p className="ts-caption">
                    あなたが選択された項目に該当する描写は、この作品の申告内容には含まれていません。
                  </p>
                </div>
              )}

              <p className="ts-caption">{SENSITIVITY_DISCLAIMER}</p>

              <div className="flex">
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="ml-auto px-3 py-1.5 text-xs font-semibold border transition-colors"
                  style={{ borderColor: preset.primary, color: preset.primary }}
                >
                  選び直す
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
})
