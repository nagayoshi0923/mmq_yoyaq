import { saveAs } from 'file-saver'

const CATEGORY_LABELS: Record<string, string> = {
  open: 'オープン公演',
  private: '貸切公演',
  gmtest: 'GMテスト',
  testplay: 'テストプレイ',
  offsite: '出張公演',
  venue_rental: '場所貸し',
  venue_rental_free: '場所貸し(無料)',
  package: 'パッケージ',
  mtg: 'MTG',
  memo: 'メモ',
}

type ExportRow = {
  date: string
  start_time: string
  end_time: string
  store_name: string
  scenario: string
  category: string
  gms: string
  capacity: number
  total_participants: number
  regular_participants: number
  staff_participants: number
  onsite_amount: number
  online_amount: number
  total_revenue: number
  license_amount: number
  gm_cost: number
  net_profit: number
}

export function exportScheduleToCSV(rows: ExportRow[], yearMonth: string) {
  const headers = [
    '日付',
    '開始時間',
    '終了時間',
    '会場',
    'シナリオ',
    'カテゴリ',
    'GM',
    '定員',
    '参加者数合計',
    '一般参加者数',
    'スタッフ参加者数',
    '予想現地決済額',
    'オンライン決済済み額',
    '売上合計',
    'ライセンス金額',
    'GM代金合計',
    '純利益',
  ]

  const dataRows = rows.map(r => [
    r.date,
    r.start_time?.slice(0, 5) ?? '',
    r.end_time?.slice(0, 5) ?? '',
    r.store_name,
    r.scenario,
    CATEGORY_LABELS[r.category] ?? r.category,
    r.gms,
    r.capacity,
    r.total_participants,
    r.regular_participants,
    r.staff_participants,
    r.onsite_amount,
    r.online_amount,
    r.total_revenue,
    r.license_amount,
    r.gm_cost,
    r.net_profit,
  ])

  const csvContent = [headers, ...dataRows]
    .map(row => row.map(cell => {
      const s = String(cell ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')

  // BOM付きUTF-8でExcelが文字化けしないようにする
  const bom = '﻿'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  saveAs(blob, `スケジュール_${yearMonth}.csv`)
}
