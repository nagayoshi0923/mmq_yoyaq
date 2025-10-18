import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card>
      <CardHeader>
        <CardTitle>データエクスポート</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <Button onClick={onExportCSV} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            CSVエクスポート
          </Button>
          <Button onClick={onExportExcel} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Excelエクスポート
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

