import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SCENARIO_SOURCE_FIELDS, sameSettingValue, type ScenarioSourceField, type ScenarioSourceState, type SourceValues } from '@/lib/scenarioSettingSources'

const displayValue = (value: unknown) => value == null || value === '' ? '未設定' : Array.isArray(value) ? value.join('、') || '未設定' : String(value)

export function ScenarioSettingSources({ state, current, master, resets, onReset }: {
  state: ScenarioSourceState | null; current: SourceValues; master: SourceValues | null; resets: SourceValues
  onReset: (field: ScenarioSourceField, value: unknown) => void
}) {
  return <details className="border rounded-lg p-3 mb-4">
    <summary className="cursor-pointer">共通情報と自社設定</summary>
    <div className="space-y-3 pt-3">
      <p>ここで編集するのは自社の作品設定です。共通情報に戻すと上書きを解除し、保存後は共通マスタの値を参照します。</p>
      <p className="text-muted-foreground">料金・GM・店舗・貸切条件は自社の運用設定です。予約済みの人数・金額を一括変更する操作ではありません。</p>
      {!state || !master ? <p role="status">設定元を確認できるまでお待ちください。取得できない場合は画面を開き直してください。</p> :
        <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="p-2">項目</th><th className="p-2">設定元</th><th className="p-2">共通情報</th><th className="p-2">自社での値</th><th className="p-2">操作</th></tr></thead><tbody>
          {SCENARIO_SOURCE_FIELDS.map(({ field, column, master: masterKey, label, fallback }) => {
            const reset = Object.prototype.hasOwnProperty.call(resets, field) && sameSettingValue(current[field], resets[field])
            const changed = !sameSettingValue(current[field], state.baseline[field])
            const inherited = reset || (!changed && state.stored[column] == null)
            const rawMasterValue = master[masterKey] ?? fallback
            const masterValue = field === 'difficulty' ? Number(rawMasterValue) : rawMasterValue
            return <tr key={field} className="border-t">
              <th className="p-2 whitespace-nowrap">{label}</th>
              <td className="p-2"><Badge variant={inherited ? 'secondary' : 'outline'}>{inherited ? '共通情報' : '自社設定'}</Badge>{(reset || changed) && <span>（未保存）</span>}</td>
              <td className="p-2 max-w-48 break-words">{displayValue(master[masterKey])}</td>
              <td className="p-2 max-w-48 break-words">{displayValue(current[field])}</td>
              <td className="p-2"><Button type="button" variant="outline" size="sm" disabled={inherited} onClick={() => onReset(field, masterValue)}>共通情報に戻す</Button></td>
            </tr>
          })}
        </tbody></table></div>}
    </div>
  </details>
}
