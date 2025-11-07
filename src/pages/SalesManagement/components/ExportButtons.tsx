import React from 'react'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface ExportButtonsProps {
  salesData?: any
  loading?: boolean
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  salesData,
  loading = false
}) => {
  const handleExportCSV = () => {
    if (!salesData) return
    // CSVエクスポート処理
    console.log('CSV export')
  }

  const handleExportExcel = () => {
    if (!salesData) return
    // Excelエクスポート処理
    console.log('Excel export')
  }

  return (
    <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3">
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

