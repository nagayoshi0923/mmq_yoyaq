import React, { useState } from 'react'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/button'
import { Download, Image, Loader2, Copy, Check } from 'lucide-react'
import { showToast } from '@/utils/toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ExportButtonsProps {
  salesData?: any
  loading?: boolean
  reportContainerId?: string  // キャプチャ対象の要素ID
  dateRange?: { startDate: string; endDate: string }
}

// 金額フォーマット
const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)

// テキストレポート生成
const generateTextReport = (salesData: any, dateRange?: { startDate: string; endDate: string }): string => {
  if (!salesData) return ''
  
  const lines: string[] = []
  
  // ヘッダー
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('📊 売上レポート')
  if (dateRange) {
    lines.push(`📅 期間: ${dateRange.startDate} ～ ${dateRange.endDate}`)
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('')
  
  // サマリー
  const totalCost = (salesData.totalVariableCost || 0) + (salesData.totalFixedCost || 0)
  const profitRate = salesData.totalRevenue > 0
    ? ((salesData.netProfit / salesData.totalRevenue) * 100).toFixed(1)
    : '0'
  lines.push('【 サマリー 】')
  lines.push(`  総売上: ${formatCurrency(salesData.totalRevenue)}（${salesData.totalEvents}公演・平均 ${formatCurrency(salesData.averageRevenuePerEvent)}）`)
  lines.push(`  支出合計: ${formatCurrency(totalCost)}（変動費 ${formatCurrency(salesData.totalVariableCost || 0)} + 固定費 ${formatCurrency(salesData.totalFixedCost || 0)}）`)
  lines.push(`  粗利益: ${formatCurrency(salesData.netProfit)}（利益率 ${profitRate}%）`)
  lines.push('')

  // 費用内訳（カード別）
  const vcBreakdown = salesData.variableCostBreakdown as Array<{ category: string; amount: number }> | undefined
  const prodBreakdown = salesData.productionCostBreakdown as Array<{ item: string; amount: number; scenario: string }> | undefined
  const propsBreakdown = salesData.propsCostBreakdown as Array<{ item: string; amount: number; scenario: string }> | undefined
  const fixedBreakdown = salesData.fixedCostBreakdown as Array<{ item: string; amount: number; store: string }> | undefined

  lines.push('【 費用内訳 】')

  // 変動費カード
  lines.push(`  ◆ 変動費: ${formatCurrency(salesData.totalVariableCost || 0)}`)
  if (vcBreakdown && vcBreakdown.length > 0) {
    vcBreakdown.forEach(item => lines.push(`    ${item.category}: ${formatCurrency(item.amount)}`))
  }
  lines.push('')

  // GM報酬カード
  lines.push(`  ◆ GM報酬: ${formatCurrency(salesData.totalGmCost || 0)}`)
  lines.push(`    GMへの支払い`)
  lines.push('')

  // FC料金カード（公演ごとのFC料金）
  const fcFee = vcBreakdown?.find(v => v.category === 'FC料金')?.amount ?? 0
  if (fcFee > 0) {
    lines.push(`  ◆ FC料金: ${formatCurrency(fcFee)}`)
    lines.push(`    ${salesData.totalEvents}公演 × ¥1,000`)
    lines.push('')
  }

  // 事務手数料カード（フランチャイズ手数料）
  const adminFee = vcBreakdown?.find(v => v.category === '事務手数料')?.amount ?? 0
  if (adminFee > 0) {
    lines.push(`  ◆ 事務手数料: ${formatCurrency(adminFee)}`)
    lines.push('')
  }

  // ライセンスカード
  lines.push(`  ◆ ライセンス: ${formatCurrency(salesData.totalLicenseCost || 0)}`)
  lines.push(`    作者への支払い`)
  lines.push('')

  // 制作費カード
  const prodTotal = (salesData.totalProductionCost || 0) + (salesData.totalPropsCost || 0)
  lines.push(`  ◆ 制作費: ${formatCurrency(prodTotal)}`)
  if (prodBreakdown && prodBreakdown.length > 0) {
    prodBreakdown.forEach(b => lines.push(`    ${b.scenario} / ${b.item}: ${formatCurrency(b.amount)}`))
  }
  if (propsBreakdown && propsBreakdown.length > 0) {
    propsBreakdown.forEach(b => lines.push(`    ${b.scenario} / ${b.item}: ${formatCurrency(b.amount)}`))
  }
  if (prodTotal === 0) lines.push(`    制作費なし`)
  lines.push('')

  // 固定費カード
  lines.push(`  ◆ 固定費: ${formatCurrency(salesData.totalFixedCost || 0)}`)
  if (fixedBreakdown && fixedBreakdown.length > 0) {
    const itemTotals: Record<string, number> = {}
    fixedBreakdown.forEach(b => { itemTotals[b.item] = (itemTotals[b.item] || 0) + b.amount })
    Object.entries(itemTotals).forEach(([item, total]) => lines.push(`    ${item}: ${formatCurrency(total)}`))
  }
  lines.push('')

  lines.push(`  支出合計: ${formatCurrency(totalCost)}`)
  lines.push('')
  
  // 公演リスト
  if (salesData.eventList && salesData.eventList.length > 0) {
    lines.push('【 公演一覧 】')
    lines.push('─────────────────────────────')
    
    salesData.eventList.forEach((event: any, index: number) => {
      const date = new Date(event.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
      lines.push(`${index + 1}. ${date} ${event.store_name}`)
      lines.push(`   ${event.scenario_title}`)
      lines.push(`   売上: ${formatCurrency(event.revenue)} / ライセンス: ${formatCurrency(event.license_cost)} / GM: ${formatCurrency(event.gm_cost)}${event.franchise_fee > 0 ? ` / FC: ${formatCurrency(event.franchise_fee)}` : ''}`)
      lines.push(`   → 粗利益: ${formatCurrency(event.net_profit)}`)
      lines.push('')
    })
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  return lines.join('\n')
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  salesData,
  loading = false,
  reportContainerId = 'sales-report-container',
  dateRange
}) => {
  const [exporting, setExporting] = useState(false)
  const [textDialogOpen, setTextDialogOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [textReport, setTextReport] = useState('')

  const handleExportCSV = () => {
    if (!salesData) {
      showToast.error('データがまだ読み込まれていません')
      return
    }

    try {
    const CATEGORY_LABELS: Record<string, string> = {
      gmtest: 'GMテスト',
      private: '貸切',
      open: '公開',
      enterprise: '企業',
      testplay: 'テストプレイ',
      offsite: '出張',
      venue_rental: '会場貸切',
      venue_rental_free: '会場貸切（無料）',
      package: 'パッケージ',
    }

    const escape = (v: unknown) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const row = (...cols: unknown[]) => cols.map(escape).join(',')

    const profitRateCsv = salesData.totalRevenue > 0
      ? ((salesData.netProfit / salesData.totalRevenue) * 100).toFixed(1)
      : '0'
    const totalCostCsv = (salesData.totalVariableCost || 0) + (salesData.totalFixedCost || 0)
    const vcBd = salesData.variableCostBreakdown as Array<{ category: string; amount: number }> | undefined
    const prodBd = salesData.productionCostBreakdown as Array<{ item: string; amount: number; scenario: string }> | undefined
    const propsBd = salesData.propsCostBreakdown as Array<{ item: string; amount: number; scenario: string }> | undefined
    const fixedBd = salesData.fixedCostBreakdown as Array<{ item: string; amount: number; store: string }> | undefined

    const summarySection = [
      row('## サマリー', ''),
      row('項目', '値'),
      row('総売上', salesData.totalRevenue),
      row('公演数', salesData.totalEvents),
      row('平均売上/公演', salesData.averageRevenuePerEvent),
      row('支出合計', totalCostCsv),
      row('変動費', salesData.totalVariableCost || 0),
      row('固定費', salesData.totalFixedCost || 0),
      row('粗利益', salesData.netProfit),
      row('利益率(%)', profitRateCsv),
      '',
      row('## 費用内訳', ''),
      row('項目', '金額'),
      ...(vcBd ?? []).map(v => row(v.category, v.amount)),
      ...(prodBd ?? []).map(b => row(`制作費 / ${b.scenario} / ${b.item}`, b.amount)),
      ...(propsBd ?? []).map(b => row(`道具費 / ${b.scenario} / ${b.item}`, b.amount)),
      ...(fixedBd ?? []).map(b => row(`固定費 / ${b.item}（${b.store}）`, b.amount)),
      row('変動費合計', salesData.totalVariableCost || 0),
      row('固定費合計', salesData.totalFixedCost || 0),
      row('支出合計', totalCostCsv),
      '',
      row('## 公演一覧', ''),
    ]

    const headers = ['日付', '店舗', 'シナリオ', '種別', '参加者数', 'GM', '売上', 'ライセンス', 'GM給与', 'FC料金', '粗利益']

    const rows = (salesData.eventList ?? []).map((e: any) => [
      e.date ?? '',
      e.store_name ?? '',
      e.scenario_title ?? '',
      CATEGORY_LABELS[e.category] ?? e.category ?? '',
      e.participant_count ?? 0,
      Array.isArray(e.gms) ? e.gms.join(' / ') : '',
      e.revenue ?? 0,
      e.license_cost ?? 0,
      e.gm_cost ?? 0,
      e.franchise_fee ?? 0,
      e.net_profit ?? 0,
    ])

    const eventRows = [headers, ...rows].map(r => r.map(escape).join(','))
    const csv = [...summarySection, ...eventRows].join('\n')
    const bom = '﻿'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const dateStr = dateRange ? `${dateRange.startDate}_${dateRange.endDate}` : new Date().toISOString().split('T')[0]
    link.download = `売上レポート_${dateStr}.csv`
    link.href = url
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast.success('CSVをダウンロードしました')
    } catch (e) {
      logger.error('CSVエクスポートエラー:', e)
      showToast.error('CSVのエクスポートに失敗しました')
    }
  }

  const handleExportExcel = () => {
    if (!salesData) return
    // Excelエクスポート処理
    logger.log('Excel export')
  }

  const handleOpenTextDialog = () => {
    if (!salesData) return
    const report = generateTextReport(salesData, dateRange)
    setTextReport(report)
    setTextDialogOpen(true)
    setCopied(false)
  }

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(textReport)
      setCopied(true)
      showToast.success('クリップボードにコピーしました')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      logger.error('クリップボードへのコピーに失敗:', error)
      showToast.error('コピーに失敗しました')
    }
  }

  const handleExportImage = async () => {
    const element = document.getElementById(reportContainerId)
    if (!element) {
      showToast.error('レポート要素が見つかりません')
      return
    }

    setExporting(true)
    try {
      // キャプチャ前にスクロール位置を保存
      const scrollY = window.scrollY
      const scrollX = window.scrollX
      
      // 一時的にページトップにスクロール
      window.scrollTo(0, 0)
      
      // 要素のサイズを取得
      const rect = element.getBoundingClientRect()
      
      // 少し待ってからキャプチャ（レンダリング待ち）
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // 動的インポート（初期バンドルサイズ削減）
      const html2canvas = (await import('html2canvas')).default
      
      const canvas = await html2canvas(element, {
        scale: 2, // 高解像度
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: rect.width,
        height: element.scrollHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
        onclone: (clonedDoc) => {
          // クローンされたドキュメントでスタイル調整
          const clonedElement = clonedDoc.getElementById(reportContainerId)
          if (clonedElement) {
            clonedElement.style.width = `${rect.width}px`
            clonedElement.style.padding = '16px'
            clonedElement.style.backgroundColor = '#ffffff'
            
            // truncateクラスを持つ要素のoverflowを解除（文字切れ対策）
            // ただしバッジ要素は除外
            const truncatedElements = clonedElement.querySelectorAll('.truncate')
            truncatedElements.forEach((el) => {
              const htmlEl = el as HTMLElement
              // バッジ要素（rounded-full, rounded-md, inline-flex）は除外
              if (htmlEl.classList.contains('rounded-full') || 
                  htmlEl.classList.contains('inline-flex') ||
                  htmlEl.closest('[class*="rounded-full"]') ||
                  htmlEl.closest('[class*="inline-flex"]')) {
                return
              }
              htmlEl.style.overflow = 'visible'
              htmlEl.style.textOverflow = 'clip'
              htmlEl.style.whiteSpace = 'normal'
              htmlEl.style.wordBreak = 'break-word'
            })
            
            // line-clampを持つ要素も解除
            const lineClampElements = clonedElement.querySelectorAll('[class*="line-clamp"]')
            lineClampElements.forEach((el) => {
              const htmlEl = el as HTMLElement
              htmlEl.style.overflow = 'visible'
              htmlEl.style.webkitLineClamp = 'unset'
            })
          }
        }
      })
      
      // スクロール位置を復元
      window.scrollTo(scrollX, scrollY)
      
      // 画像としてダウンロード
      const link = document.createElement('a')
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      link.download = `売上レポート_${dateStr}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      showToast.success('画像を保存しました')
    } catch (error) {
      logger.error('画像エクスポートエラー:', error)
      showToast.error('画像の保存に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3">
        {/* テキストコピーボタン（一番目立つ位置に） */}
        <Button 
          variant="default" 
          onClick={handleOpenTextDialog} 
          disabled={loading || !salesData}
          size="sm"
          className="text-xs sm:text-sm h-7 sm:h-9"
        >
          <Copy className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">テキストコピー</span>
          <span className="sm:hidden">コピー</span>
        </Button>
        <Button 
          variant="outline" 
          onClick={handleExportImage} 
          disabled={loading || !salesData || exporting}
          size="sm"
          className="text-xs sm:text-sm h-7 sm:h-9"
        >
          {exporting ? (
            <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
          ) : (
            <Image className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          )}
          <span className="hidden sm:inline">画像保存</span>
          <span className="sm:hidden">画像</span>
        </Button>
        <Button 
          variant="outline" 
          onClick={handleExportCSV} 
          disabled={loading || !salesData}
          size="sm"
          className="text-xs sm:text-sm h-7 sm:h-9"
        >
          <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">CSVエクスポート</span>
          <span className="sm:hidden">CSV</span>
        </Button>
        <Button 
          variant="outline" 
          onClick={handleExportExcel} 
          disabled={loading || !salesData}
          size="sm"
          className="text-xs sm:text-sm h-7 sm:h-9"
        >
          <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Excelエクスポート</span>
          <span className="sm:hidden">Excel</span>
        </Button>
      </div>

      {/* テキストコピーダイアログ */}
      <Dialog open={textDialogOpen} onOpenChange={setTextDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>売上レポート（テキスト）</span>
              <Button 
                onClick={handleCopyText}
                size="sm"
                variant={copied ? "default" : "outline"}
                className="ml-4"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    コピー済み
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    コピー
                  </>
                )}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/50 rounded-lg p-4">
            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
              {textReport}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
