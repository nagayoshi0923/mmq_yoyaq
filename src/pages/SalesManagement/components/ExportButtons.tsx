import React from 'react'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface ExportButtonsProps {
  onExportCSV: () => void
  onExportExcel: () => void
  loading?: boolean
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  onExportCSV,
  onExportExcel,
  loading = false
}) => {
  return (
    <div className="flex gap-4">
      <Button variant="outline" onClick={onExportCSV} disabled={loading}>
        <Download className="mr-2 h-4 w-4" />
        CSVエクスポート
      </Button>
      <Button variant="outline" onClick={onExportExcel} disabled={loading}>
        <Download className="mr-2 h-4 w-4" />
        Excelエクスポート
      </Button>
    </div>
  )
}

