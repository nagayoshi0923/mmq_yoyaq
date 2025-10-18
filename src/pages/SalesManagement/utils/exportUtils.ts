import * as XLSX from 'xlsx'
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

export function exportToExcel({ salesData, dateRange, storeName }: ExportOptions) {
  const workbook = XLSX.utils.book_new()

  // 概要シート
  const summaryData = [
    ['売上管理レポート'],
    [`期間: ${dateRange.startDate} ～ ${dateRange.endDate}`],
    [`店舗: ${storeName}`],
    [''],
    ['概要'],
    ['総売上', salesData.totalRevenue],
    ['総公演数', salesData.totalEvents],
    ['平均売上/公演', salesData.averageRevenuePerEvent]
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, '概要')

  // 店舗別ランキングシート
  const storeData = [
    ['順位', '店舗名', '売上', '公演数'],
    ...salesData.storeRanking.map((store, index) => [
      index + 1,
      store.name,
      store.revenue,
      store.events
    ])
  ]
  const storeSheet = XLSX.utils.aoa_to_sheet(storeData)
  XLSX.utils.book_append_sheet(workbook, storeSheet, '店舗別売上')

  // シナリオ別ランキングシート
  const scenarioData = [
    ['順位', 'シナリオ名', '売上', '公演数'],
    ...salesData.scenarioRanking.map((scenario, index) => [
      index + 1,
      scenario.title,
      scenario.revenue,
      scenario.events
    ])
  ]
  const scenarioSheet = XLSX.utils.aoa_to_sheet(scenarioData)
  XLSX.utils.book_append_sheet(workbook, scenarioSheet, 'シナリオ別売上')

  // 月別売上推移シート
  const monthlyData = [
    ['月', '売上', '公演数'],
    ...(salesData.monthlyRevenue || []).map(month => [
      month.month,
      month.revenue,
      month.events
    ])
  ]
  const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData)
  XLSX.utils.book_append_sheet(workbook, monthlySheet, '月別推移')

  const fileName = `売上レポート_${dateRange.startDate}_${dateRange.endDate}_${storeName}.xlsx`
  XLSX.writeFile(workbook, fileName)
}

