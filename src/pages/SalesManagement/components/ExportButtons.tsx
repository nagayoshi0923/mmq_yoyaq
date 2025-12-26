import React, { useState } from 'react'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/button'
import { Download, Image, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { showToast } from '@/utils/toast'

interface ExportButtonsProps {
  salesData?: any
  loading?: boolean
  reportContainerId?: string  // キャプチャ対象の要素ID
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  salesData,
  loading = false,
  reportContainerId = 'sales-report-container'
}) => {
  const [exporting, setExporting] = useState(false)

  const handleExportCSV = () => {
    if (!salesData) return
    // CSVエクスポート処理
    logger.log('CSV export')
  }

  const handleExportExcel = () => {
    if (!salesData) return
    // Excelエクスポート処理
    logger.log('Excel export')
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
            const truncatedElements = clonedElement.querySelectorAll('.truncate')
            truncatedElements.forEach((el) => {
              const htmlEl = el as HTMLElement
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
              htmlEl.style.display = 'block'
              htmlEl.style.webkitLineClamp = 'unset'
            })
            
            // overflow-hiddenを持つ要素のoverflowを解除（バッジ切れ対策）
            const overflowElements = clonedElement.querySelectorAll('.overflow-hidden, .overflow-x-hidden, .overflow-y-hidden')
            overflowElements.forEach((el) => {
              const htmlEl = el as HTMLElement
              htmlEl.style.overflow = 'visible'
            })
            
            // バッジ（Badge）要素のスタイル調整
            const badgeElements = clonedElement.querySelectorAll('[class*="badge"], [class*="Badge"]')
            badgeElements.forEach((el) => {
              const htmlEl = el as HTMLElement
              htmlEl.style.overflow = 'visible'
              htmlEl.style.whiteSpace = 'nowrap'
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
    <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3">
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
  )
}
