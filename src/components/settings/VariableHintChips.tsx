/**
 * テンプレ編集の「使える差し込み変数」チップ一覧。
 *
 * 各変数は説明付きで表示し、設定画面で値・選択肢を変えられる変数
 * （会社情報・キャンセル理由など）はクリックでその設定画面を別タブで開ける。
 * EmailSettings と TemplateEditDialog の両方から使う共通部品。
 */
import { ExternalLink } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { VARIABLE_DESCRIPTIONS, getVariableSource, settingsTabPath } from '@/lib/templateRegistry'

interface VariableHintChipsProps {
  variables: string[]
  /** 基本変数（グレー）か追加変数（青）か。色分け用 */
  accent?: 'base' | 'additional'
}

export function VariableHintChips({ variables, accent = 'base' }: VariableHintChipsProps) {
  const { organization } = useOrganization()
  const slug = organization?.slug

  const codeClass = accent === 'additional' ? 'bg-blue-50' : 'bg-gray-100'
  const descClass = accent === 'additional' ? 'text-blue-500' : 'text-gray-500'

  return (
    <div className={`text-xs leading-relaxed space-y-0.5 ${accent === 'additional' ? 'text-blue-600' : 'text-muted-foreground'}`}>
      {variables.map(v => {
        const source = getVariableSource(v)
        const desc = VARIABLE_DESCRIPTIONS[v]
        const code = <code className={`${codeClass} px-1 rounded`}>{`{${v}}`}</code>

        // 設定で変えられる変数はリンクにして、その設定画面を別タブで開く
        if (source.settingsTab && slug) {
          return (
            <a
              key={v}
              href={settingsTabPath(slug, source.settingsTab)}
              target="_blank"
              rel="noopener noreferrer"
              title={source.note}
              className="inline-flex items-center gap-0.5 mr-3 hover:opacity-80"
            >
              {code}
              <span className={`${descClass} underline decoration-dotted`}>{desc}</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
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
