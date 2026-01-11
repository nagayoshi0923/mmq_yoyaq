import { saveAs } from 'file-saver'
import { SalesData } from '@/types'

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)
}

interface ExportOptions {
  salesData: SalesData
  dateRange: { startDate: string; endDate: string }
  storeName: string
}

export function exportToCSV({ salesData, dateRange, storeName }: ExportOptions) {
  const csvData = [
    ['売上管理レポート'],
    [`期間: ${dateRange.startDate} ～ ${dateRange.endDate}`],
    [`店舗: ${storeName}`],
    [''],
    ['概要'],
    ['総売上', formatCurrency(salesData.totalRevenue)],
    ['総公演数', `${salesData.totalEvents}回`],
    ['平均売上/公演', formatCurrency(salesData.averageRevenuePerEvent)],
    [''],
    ['店舗別売上ランキング'],
    ['順位', '店舗名', '売上', '公演数'],
    ...salesData.storeRanking.map((store, index) => [
      index + 1,
      store.name,
      formatCurrency(store.revenue),
      `${store.events}回`
    ]),
    [''],
    ['シナリオ別売上ランキング'],
    ['順位', 'シナリオ名', '売上', '公演数'],
    ...salesData.scenarioRanking.map((scenario, index) => [
      index + 1,
      scenario.title,
      formatCurrency(scenario.revenue),
      `${scenario.events}回`
    ]),
    [''],
    ['月別売上推移'],
    ['月', '売上', '公演数'],
    ...(salesData.monthlyRevenue || []).map(month => [
      month.month,
      formatCurrency(month.revenue),
      `${month.events}回`
    ])
  ]

  const csvContent = csvData.map(row => row.join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const fileName = `売上レポート_${dateRange.startDate}_${dateRange.endDate}_${storeName}.csv`
  saveAs(blob, fileName)
}

export async function exportToExcel({ salesData, dateRange, storeName }: ExportOptions) {
  // ExcelJS を動的インポート（使用時のみロード）
  const ExcelJS = await import('exceljs')
  
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMQ YOYAQ'
  workbook.created = new Date()

  // 概要シート
  const summarySheet = workbook.addWorksheet('概要')
  summarySheet.addRow(['売上管理レポート'])
  summarySheet.addRow([`期間: ${dateRange.startDate} ～ ${dateRange.endDate}`])
  summarySheet.addRow([`店舗: ${storeName}`])
  summarySheet.addRow([])
  summarySheet.addRow(['概要'])
  summarySheet.addRow(['総売上', salesData.totalRevenue])
  summarySheet.addRow(['総公演数', salesData.totalEvents])
  summarySheet.addRow(['平均売上/公演', salesData.averageRevenuePerEvent])

  // 店舗別ランキングシート
  const storeSheet = workbook.addWorksheet('店舗別売上')
  storeSheet.addRow(['順位', '店舗名', '売上', '公演数'])
  salesData.storeRanking.forEach((store, index) => {
    storeSheet.addRow([index + 1, store.name, store.revenue, store.events])
  })

  // シナリオ別ランキングシート
  const scenarioSheet = workbook.addWorksheet('シナリオ別売上')
  scenarioSheet.addRow(['順位', 'シナリオ名', '売上', '公演数'])
  salesData.scenarioRanking.forEach((scenario, index) => {
    scenarioSheet.addRow([index + 1, scenario.title, scenario.revenue, scenario.events])
  })

  // 月別売上推移シート
  const monthlySheet = workbook.addWorksheet('月別推移')
  monthlySheet.addRow(['月', '売上', '公演数'])
  ;(salesData.monthlyRevenue || []).forEach(month => {
    monthlySheet.addRow([month.month, month.revenue, month.events])
  })

  // Excelファイルを出力
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const fileName = `売上レポート_${dateRange.startDate}_${dateRange.endDate}_${storeName}.xlsx`
  saveAs(blob, fileName)
}

