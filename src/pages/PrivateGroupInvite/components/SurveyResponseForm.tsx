/**
 * 事前配役アンケートの回答シート（見本 SurveySheet.dc.html。候補日の編集・配役と同じ全画面シート）。
 *   上に固定: 題名・作品・開催日時・店舗・回答期限・× で閉じる、緑の帯（回答の届き先）
 *   本文: 1. やってみたいキャラクター（カード 2 列・押す順に第 1／第 2 希望・おまかせ）→ 2. 以降は店舗の設問
 *   下に固定: 「回答を送る」（回答済みなら「回答を変更する」）。期限を過ぎたら送れない
 * 設問・保存の仕組みは従来どおり（survey_read / survey_write、会員・ゲスト PIN 共通）。
 * キャラクターの回答は従来どおり設問 id に第 1 希望のキャラクター id を 1 つ。第 2 希望は回答のキー character_second_choice（列は足さない）。
 */
import { useRef } from 'react'
import { AlertCircle, Check, ClipboardList, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { isPastPerformanceDate, isSurveyQuestionShown, SURVEY_CHARACTER_ANY, SURVEY_SECOND_CHOICE_KEY, toggleCharacterPick, type CharacterPicks } from '@/lib/surveyCompletion'
import { formatJstMonthDay } from '@/utils/jstDate'
import type { SurveyQuestion } from '@/types'
import { CharacterImage } from '../groupPage/casting/CharacterImage'
import { useSurveyResponse, type SurveyAnswers, type SurveyCharacter } from './useSurveyResponse'

export const SURVEY_TITLE = '事前配役アンケート'

interface SurveyResponseFormProps {
  groupId: string
  memberId: string
  /** 確定した公演の日付。候補日（申請時の履歴）は渡さない。未確定なら期限の目安は出さない */
  performanceDate?: string
  /** 開始時刻（"14:00:00" など）と店舗名（見出しの 2 行目） */
  startTime?: string | null
  storeName?: string | null
  scenarioTitle?: string | null
  characters?: ReadonlyArray<SurveyCharacter>
  /** 配役方法が「事前配役アンケート」でない（キャラクターの設問を出さない） */
  hideCharacterSelection?: boolean
  /** 送ったあと（状態の箱・概要・マイページのカードを読み直す）。シートはこのあと閉じる */
  onSubmitted?: () => void
  onClose: () => void
}

const GENDER_NOTES: Record<string, string> = { male: '男性役', female: '女性役', any: '性別自由' }

export function SurveyResponseForm(props: SurveyResponseFormProps) {
  const { groupId, memberId, performanceDate, startTime, storeName, scenarioTitle, characters = [], hideCharacterSelection = false, onSubmitted, onClose } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const s = useSurveyResponse({
    groupId, memberId, performanceDate, characters, rootRef,
    // 作品にキャラクターが無いときも、キャラクターの設問は出さない（問わない）
    hideCharacterSelection: loaded => hideCharacterSelection || loaded.length === 0,
    onSubmitted: () => { onSubmitted?.(); onClose() },
  })

  const deadlineText = s.deadlineDate ? formatJstMonthDay(s.deadlineDate, true) : ''
  const when = performanceDate ? `${formatJstMonthDay(performanceDate + 'T12:00:00+09:00', true)}${startTime ? ` ${startTime.slice(0, 5)}` : ''}` : ''
  const meta = [scenarioTitle, [when, storeName].filter(Boolean).join(' '), deadlineText && `回答期限 ${deadlineText}`].filter(Boolean).join(' ・ ')

  const pastPerformance = isPastPerformanceDate(performanceDate)
  const pastDeadline = Boolean(s.deadlineDate && new Date() > s.deadlineDate)
  const visible = s.questions.filter(q => isSurveyQuestionShown(q, s.hideChar))
  const charQ = visible.find(q => q.question_type === 'character_selection')
  // キャラクターの設問を先頭（1.）に、店舗の設問を 2. 以降に
  const ordered = charQ ? [charQ, ...visible.filter(q => q !== charQ)] : visible
  const ready = s.status === 'ready' && !s.externalSurveyUrl && !pastPerformance && ordered.length > 0
  const canSend = ready && !pastDeadline

  const setAnswer = (id: string, value: string | string[] | null) => s.setResponses((prev: SurveyAnswers) => {
    const next = { ...prev }
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) delete next[id]
    else next[id] = value
    return next
  })

  let body: JSX.Element
  if (s.loading) {
    body = (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" aria-hidden="true" />
        アンケートを読み込み中...
      </div>
    )
  } else if (s.status === 'not_found') {
    body = (
      <div className="py-8 text-center text-muted-foreground">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" aria-hidden="true" />
        <p className="text-sm">{s.loadErrorText || 'アンケート情報を取得できませんでした'}</p>
        <p className="mt-1 text-xs">解決しない場合は、この画面の表示を店舗へお知らせください</p>
      </div>
    )
  } else if (s.status === 'disabled') {
    body = <Notice>このアンケートは現在受け付けていません。ご不明な点は店舗へお問い合わせください。</Notice>
  } else if (pastPerformance) {
    body = <Notice>公演日を過ぎたため、アンケートの回答受付は終了しました。</Notice>
  } else if (s.externalSurveyUrl) {
    body = (
      <div className="space-y-2 text-sm">
        <p>このアンケートは店舗のフォームで回答します。</p>
        <a href={s.externalSurveyUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700 underline">アンケートに回答する</a>
      </div>
    )
  } else if (s.status === 'no_questions' || s.questions.length === 0) {
    body = (
      <div className="py-8 text-center text-muted-foreground">
        <ClipboardList className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
        <p className="text-sm">アンケートの質問が設定されていません</p>
      </div>
    )
  } else if (ordered.length === 0) {
    body = <Notice>いまご回答いただく質問はありません。</Notice>
  } else {
    body = (
      <div className="flex flex-col gap-5">
        {ordered.map((q, i) => (
          <section key={q.id} data-testid="survey-question" data-type={q.question_type}>
            <h2 className="text-sm font-bold">
              {i + 1}. {q.question_type === 'character_selection' ? 'やってみたいキャラクター' : q.question_text}{' '}
              {q.is_required
                ? <span className="text-xs font-normal text-red-700">必須</span>
                : <span className="text-xs font-normal text-muted-foreground">任意</span>}
            </h2>
            {q.question_type === 'character_selection' ? (
              <CharacterQuestion
                characters={s.characters}
                value={typeof s.responses[q.id] === 'string' ? s.responses[q.id] as string : ''}
                second={typeof s.responses[SURVEY_SECOND_CHOICE_KEY] === 'string' ? s.responses[SURVEY_SECOND_CHOICE_KEY] as string : null}
                disabled={!canSend}
                onChange={(picks, any) => {
                  setAnswer(q.id, any ? SURVEY_CHARACTER_ANY : picks.first)
                  setAnswer(SURVEY_SECOND_CHOICE_KEY, any ? null : picks.second)
                }}
              />
            ) : (
              <QuestionField q={q} value={s.responses[q.id]} disabled={!canSend} onChange={v => setAnswer(q.id, v)} />
            )}
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-background sm:bg-black/40" role="dialog" aria-modal="true" aria-label={SURVEY_TITLE} data-testid="survey-sheet">
      <div ref={rootRef} className="flex h-dvh w-full max-w-lg flex-col bg-background sm:border-x sm:border-border" data-survey-form="">
        <header className="flex shrink-0 items-start gap-2 border-b border-border px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold">{SURVEY_TITLE}</h1>
            {meta && <p className="text-xs text-muted-foreground" data-testid="survey-meta">{meta}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="-mr-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <p className="shrink-0 bg-emerald-50 px-3.5 py-1.5 text-xs text-emerald-800">回答は店舗と GM にだけ届きます。配役は当日お伝えします。</p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3">{body}</div>
        {ready && (
          <footer className="shrink-0 border-t border-border px-3.5 pb-3.5 pt-2.5" data-testid="survey-footer">
            {pastDeadline ? (
              <>
                <Button type="button" className="w-full" disabled data-testid="survey-submit">回答期限を過ぎました</Button>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">回答期限（{deadlineText}）を過ぎたため送れません。変更があるときは店舗へご連絡ください。</p>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
                  onClick={() => void s.submit()}
                  disabled={s.submitting}
                  data-testid="survey-submit"
                >
                  {s.submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />送信中...</> : s.submitted ? '回答を変更する' : '回答を送る'}
                </Button>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">送ったあとも期限までは変更できます</p>
              </>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}

/** 1. やってみたいキャラクター（カード 2 列。押す順に第 1・第 2 希望、または「おまかせ」） */
function CharacterQuestion({ characters, value, second, disabled, onChange }: {
  characters: SurveyCharacter[]
  value: string
  second: string | null
  disabled: boolean
  onChange: (picks: CharacterPicks, any: boolean) => void
}) {
  const any = value === SURVEY_CHARACTER_ANY
  const picks: CharacterPicks = { first: !any && value ? value : null, second: !any && value ? second : null }
  return (
    <div>
      <p className="text-xs text-muted-foreground">第 1 希望と第 2 希望を選んでください。希望どおりにならないこともあります。</p>
      <div className="mt-2 grid grid-cols-2 gap-2" role="list" aria-label="キャラクター">
        {characters.map(c => {
          const rank = picks.first === c.id ? 1 : picks.second === c.id ? 2 : 0
          const note = rank ? `第 ${rank} 希望` : (c.gender && GENDER_NOTES[c.gender]) || ''
          return (
            <button
              key={c.id}
              type="button"
              role="listitem"
              aria-pressed={rank > 0}
              aria-label={`${c.name}${rank ? `（第 ${rank} 希望）` : ''}`}
              disabled={disabled}
              onClick={() => onChange(toggleCharacterPick(picks, c.id), false)}
              className={`rounded-lg border-2 p-1.5 text-left transition-colors disabled:opacity-60 ${
                rank === 1 ? 'border-violet-600 bg-violet-50' : rank === 2 ? 'border-violet-300 bg-violet-50/50' : 'border-border bg-background hover:bg-muted'
              }`}
              data-testid="survey-character"
              data-rank={rank || undefined}
            >
              <CharacterImage c={c} className="aspect-[4/3] w-full rounded-md" />
              <span className="mt-1 block truncate text-sm font-bold">{c.name}</span>
              <span className={`block truncate text-xs ${rank === 1 ? 'text-violet-800' : rank === 2 ? 'text-violet-600' : 'text-muted-foreground'}`}>{note || ' '}</span>
            </button>
          )
        })}
      </div>
      <label className="mt-2.5 flex items-center gap-2 text-sm">
        <Checkbox
          checked={any}
          disabled={disabled}
          onCheckedChange={checked => onChange({ first: null, second: null }, checked === true)}
          data-testid="survey-character-any"
        />
        どのキャラクターでもよい（おまかせ）
      </label>
    </div>
  )
}

const CHIP = 'rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60'
const CHIP_ON = 'border-2 border-violet-600 bg-violet-50 font-bold text-violet-800'
const CHIP_OFF = 'border-zinc-300 bg-background hover:bg-muted'

/** 店舗の設問（選択肢はチップ、自由記述は枠） */
function QuestionField({ q, value, disabled, onChange }: {
  q: SurveyQuestion
  value: string | string[] | undefined
  disabled: boolean
  onChange: (value: string | string[] | null) => void
}) {
  if (q.question_type === 'text') {
    return (
      <Textarea
        value={typeof value === 'string' ? value : ''}
        onChange={e => onChange(e.target.value)}
        placeholder="回答を入力してください"
        rows={3}
        disabled={disabled}
        className="mt-2 resize-none text-sm"
        aria-label={q.question_text}
      />
    )
  }
  const multiple = q.question_type === 'multiple_choice'
  const options = q.question_type === 'rating'
    ? [1, 2, 3, 4, 5].map(n => ({ value: String(n), label: String(n) }))
    : q.options ?? []
  const current = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role={multiple ? 'group' : 'radiogroup'} aria-label={q.question_text}>
      {options.map(o => {
        const on = current.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            disabled={disabled}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            onClick={() => {
              if (multiple) onChange(on ? current.filter(v => v !== o.value) : [...current, o.value])
              else onChange(on ? null : o.value)
            }}
          >
            {on && <Check className="-ml-0.5 mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
