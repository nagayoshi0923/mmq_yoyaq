import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { recruitmentMissingLimit, type RecruitmentTarget } from '../../../shared/recruitmentTarget'

export function RecruitmentTargetFields({ value, onChange, minimum, disabled, idPrefix = 'recruitment-target' }: {
  value: RecruitmentTarget; onChange: (value: RecruitmentTarget) => void; minimum: number; disabled?: boolean; idPrefix?: string
}) {
  return <>
    <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor={`${idPrefix}-mode`}>対象の指定方法</Label><div className="scenario-edit-field__control">
      <Select value={value.mode} onValueChange={mode => onChange({ mode: mode as RecruitmentTarget['mode'], value: mode === 'percent' ? 50 : 2 })} disabled={disabled}>
        <SelectTrigger id={`${idPrefix}-mode`} className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="count">人数で指定</SelectItem><SelectItem value="percent">割合で指定</SelectItem></SelectContent>
      </Select>
    </div></div>
    <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor={`${idPrefix}-value`}>{value.mode === 'percent' ? '不足人数の割合' : '不足人数の上限'}</Label><div className="scenario-edit-field__control flex flex-wrap items-center gap-2">
      <Input id={`${idPrefix}-value`} className="h-8 w-24" type="number" min={1} max={value.mode === 'percent' ? 100 : 20} step={1} value={Number.isFinite(value.value) ? value.value : ''} onChange={e => onChange({ ...value, value: e.target.valueAsNumber })} disabled={disabled} />
      <span className="scenario-edit-card__help">{value.mode === 'percent' ? '％以内の不足（最低開催人数に対する割合）' : '人以内の不足（最低開催人数まで）'}</span>
    </div></div>
    <RecruitmentTargetExample minimum={minimum} target={value} />
  </>
}

export function RecruitmentTargetExample({ minimum, target }: { minimum: number; target: RecruitmentTarget }) {
  const limit = recruitmentMissingLimit(minimum, target)
  return <p className="scenario-edit-card__note" aria-live="polite" data-testid="recruitment-example">
    {limit === null ? '有効な整数を入力すると、追加募集の条件を表示します。' : <>
      {target.mode === 'percent' ? `最低${minimum}人 × ${target.value}％ ＝ ${minimum * target.value / 100} → 不足${limit}人以内（端数切り捨て）。` : `最低${minimum}人の場合、不足${limit}人以内。`}
      {limit === 0 ? '不足1人でも追加募集の対象にはなりません。' : `${Math.max(0, minimum - limit)}人以上集まっていれば追加募集の対象です。`}
    </>}
  </p>
}
