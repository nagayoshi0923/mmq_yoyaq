/**
 * テンプレ編集の「使える差し込み変数」チップ一覧。
 *
 * 各変数は説明付きで表示し、設定画面で値・選択肢を変えられる変数
 * （会社情報・キャンセル理由・却下理由など）はクリックでその設定画面へ遷移できる。
 * EmailSettings と TemplateEditDialog の両方から使う共通部品。
 */
import { useNavigate } from 'react-router-dom'
import { useOrganization } from '@/hooks/useOrganization'
import { VARIABLE_DESCRIPTIONS, getVariableSource, settingsTabPath } from '@/lib/templateRegistry'

interface VariableHintChipsProps {
  variables: string[]
  /** 基本変数（グレー）か追加変数（青）か。色分け用（リンクは常に青＋下線） */
  accent?: 'base' | 'additional'
}

export function VariableHintChips({ variables, accent = 'base' }: VariableHintChipsProps) {
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const slug = organization?.slug

  const codeClass = accent === 'additional' ? 'bg-blue-50' : 'bg-gray-100'
  const descClass = accent === 'additional' ? 'text-blue-500' : 'text-gray-500'

  return (
    <div className={`text-xs leading-relaxed space-y-0.5 ${accent === 'additional' ? 'text-blue-600' : 'text-muted-foreground'}`}>
      {variables.map(v => {
        const source = getVariableSource(v)
        const desc = VARIABLE_DESCRIPTIONS[v]
        const code = <code className={`${codeClass} px-1 rounded`}>{`{${v}}`}</code>

        // 設定で変えられる変数はリンク（青＋下線）。クリックでアプリ内遷移して設定画面を開く
        if (source.settingsTab && slug) {
          const tab = source.settingsTab
          return (
            <button
              key={v}
              type="button"
              onClick={() => navigate(settingsTabPath(slug, tab))}
              title={source.note}
              className="inline-block mr-3 align-baseline text-blue-600 underline hover:text-blue-800"
            >
              {code}
              <span className="ml-1">{desc}</span>
            </button>
          )
        }

        return (
          <span key={v} className="inline-block mr-3" title={source.note}>
            {code}
            <span className={`${descClass} ml-1`}>{desc}</span>
          </span>
        )
      })}
    </div>
  )
}
