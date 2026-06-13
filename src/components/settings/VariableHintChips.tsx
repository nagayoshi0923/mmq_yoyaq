/**
 * テンプレ編集の「使える差し込み変数」チップ一覧。
 *
 * 各変数は説明付きで表示し、設定で値・選択肢を変えられる変数
 * （会社情報・キャンセル理由・却下理由など）はクリックでその場の編集モーダルを開ける。
 * EmailSettings と TemplateEditDialog の両方から使う共通部品。
 */
import { useState } from 'react'
import { VARIABLE_DESCRIPTIONS, getVariableSource } from '@/lib/templateRegistry'
import { VariableSettingDialog } from '@/components/settings/VariableSettingDialog'

interface VariableHintChipsProps {
  variables: string[]
  /** 基本変数（グレー）か追加変数（青）か。色分け用（リンクは常に青＋下線） */
  accent?: 'base' | 'additional'
  /** 編集対象の店舗。無ければ組織で解決 */
  storeId?: string | null
  organizationId?: string | null
  /** 変数の値を保存したときに呼ばれる（プレビュー即時反映用） */
  onVariableSaved?: (variable: string, value: string) => void
}

export function VariableHintChips({ variables, accent = 'base', storeId, organizationId, onVariableSaved }: VariableHintChipsProps) {
  const [editVar, setEditVar] = useState<string | null>(null)

  const codeClass = accent === 'additional' ? 'bg-blue-50' : 'bg-gray-100'
  const descClass = accent === 'additional' ? 'text-blue-500' : 'text-gray-500'

  return (
    <div className={`text-xs leading-relaxed space-y-0.5 ${accent === 'additional' ? 'text-blue-600' : 'text-muted-foreground'}`}>
      {variables.map(v => {
        const source = getVariableSource(v)
        const desc = VARIABLE_DESCRIPTIONS[v]
        const code = <code className={`${codeClass} px-1 rounded`}>{`{${v}}`}</code>

        // 設定で変えられる変数はリンク（青＋下線）。クリックでその場の編集モーダルを開く
        if (source.settingsTab) {
          return (
            <button
              key={v}
              type="button"
              onClick={() => setEditVar(v)}
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

      <VariableSettingDialog
        variable={editVar}
        storeId={storeId}
        organizationId={organizationId}
        open={editVar !== null}
        onOpenChange={(o) => { if (!o) setEditVar(null) }}
        onSaved={onVariableSaved}
      />
    </div>
  )
}
