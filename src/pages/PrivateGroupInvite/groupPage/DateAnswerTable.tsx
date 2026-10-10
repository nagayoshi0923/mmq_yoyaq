/**
 * 日程タブの回答表（刷新 段階 1 の主役）。行＝候補日、列＝メンバー、セル＝○△×（未回答は「–」）。
 * 最も集まっている行を薄紫にする。自分の列のセルを押すと ○→△→×→○ と変わり、その場で保存する。
 * 列が多いときは横に動かせる（1 列目は固定）。
 */
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DateResponse } from '@/types'
import { RESPONSE_MARK, nextResponse, rowTally, type AnswerTable } from './groupPageModel'

const MARK_CLASS: Record<DateResponse | 'none', string> = {
  ok: 'bg-green-100 text-green-700',
  maybe: 'bg-amber-100 text-amber-700',
  ng: 'bg-red-100 text-red-700',
  none: 'bg-muted text-muted-foreground',
}

interface DateAnswerTableProps {
  table: AnswerTable
  /** 自分の列を押して回答できるか（参加中・店舗への申込前） */
  canAnswer: boolean
  onAnswer: (candidateId: string, response: DateResponse) => Promise<void>
  /** 行末の「この日で申し込む」（主催者・申込前のみ） */
  onBook: ((candidateId: string) => void) | null
}

export function DateAnswerTable({ table, canAnswer, onAnswer, onBook }: DateAnswerTableProps) {
  // 押した直後の見た目（保存が終わるまで）。失敗したら戻す
  const [pending, setPending] = useState<Record<string, DateResponse>>({})
  const [saving, setSaving] = useState<string | null>(null)

  if (table.rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">候補日はまだありません</p>
  }

  const toggle = async (candidateId: string, current: DateResponse | null) => {
    if (saving) return
    const next = nextResponse(current)
    setPending(prev => ({ ...prev, [candidateId]: next }))
    setSaving(candidateId)
    try {
      await onAnswer(candidateId, next)
    } finally {
      setSaving(null)
      setPending(prev => {
        const copy = { ...prev }
        delete copy[candidateId]
        return copy
      })
    }
  }

  return (
    <div className="-mx-3 overflow-x-auto" data-testid="date-answer-table">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground border-b border-border">候補日</th>
            {table.columns.map(col => (
              <th key={col.memberId} scope="col" className="px-1.5 py-2 text-center text-xs font-medium text-muted-foreground border-b border-border min-w-12">
                <span className="block max-w-20 mx-auto truncate text-foreground/80">{col.name}</span>
                {col.isMe && <span className="block text-violet-700">あなた</span>}
                {!col.isMe && col.role === 'guest' && <span className="block">ゲスト</span>}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-center text-xs font-medium text-muted-foreground border-b border-border whitespace-nowrap">集計</th>
            {onBook && <th scope="col" className="hidden sm:table-cell border-b border-border"><span className="sr-only">申込</span></th>}
          </tr>
        </thead>
        <tbody>
          {table.rows.map(row => {
            const best = row.id === table.bestRowId
            const rowBg = best ? 'bg-violet-50' : 'bg-card'
            return (
              <tr key={row.id} className={rowBg} data-best={best || undefined} data-row={row.id}>
                <td className={`sticky left-0 z-10 px-3 py-2 text-left whitespace-nowrap border-b border-border ${rowBg}`}>
                  <span className={`block font-bold ${row.rejected ? 'line-through text-muted-foreground' : ''}`}>{row.dateLabel}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.rejected ? '店舗が見送り' : `${row.slotLabel} ${row.startTime}`}
                  </span>
                  {/* スマホは行末の列が画面の外に出るので、日付の下に置く */}
                  {onBook && !row.rejected && (
                    <button type="button" onClick={() => onBook(row.id)} className={`sm:hidden mt-0.5 text-xs font-bold ${best ? 'text-violet-700' : 'text-foreground/70'} hover:underline`}>
                      この日で申し込む ›
                    </button>
                  )}
                </td>
                {table.columns.map(col => {
                  const value = (col.isMe ? pending[row.id] : undefined) ?? row.cells[col.memberId]
                  const mark = value ? RESPONSE_MARK[value] : '–'
                  const cls = `inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-bold ${MARK_CLASS[value ?? 'none']}`
                  const editable = col.isMe && canAnswer && !row.rejected
                  return (
                    <td key={col.memberId} className="px-1.5 py-2 text-center border-b border-border">
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => void toggle(row.id, value ?? null)}
                          className={`${cls} ring-2 ring-violet-600 ring-offset-1 hover:opacity-80`}
                          aria-label={`${row.dateLabel} ${row.slotLabel} のあなたの回答（いまは ${value ? mark : '未回答'}）。押すと変わります`}
                          data-testid="my-answer-cell"
                        >
                          {saving === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : mark}
                        </button>
                      ) : (
                        <span className={`${cls} ${col.isMe ? 'ring-2 ring-violet-300 ring-offset-1' : ''}`} aria-label={`${col.name}: ${value ? mark : '未回答'}`}>{mark}</span>
                      )}
                    </td>
                  )
                })}
                <td className="px-2 py-2 text-center text-xs whitespace-nowrap border-b border-border">{row.rejected ? '—' : rowTally(row, ' ') || '—'}</td>
                {onBook && (
                  <td className="hidden sm:table-cell px-2 py-2 text-right border-b border-border">
                    {!row.rejected && (
                      <Button
                        type="button"
                        size="sm"
                        variant={best ? 'default' : 'outline'}
                        className={`h-auto py-1.5 px-2.5 text-xs rounded-md whitespace-nowrap ${best ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-background border-zinc-300'}`}
                        onClick={() => onBook(row.id)}
                      >
                        この日で申し込む
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
