import { useRef } from 'react'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { Button } from '@/components/ui/button'
import { Upload, Download } from 'lucide-react'

interface CsvImportExportProps<T> {
  // インポート関連
  onImport: (file: File) => Promise<void>
  isImporting: boolean
  importLabel?: string
  
  // エクスポート関連
  data: T[]
  exportFilename: string
  headers: string[]
  rowMapper: (item: T) => string[]
  exportLabel?: string
  
  // スタイル
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

/**
 * CSV インポート・エクスポート機能を提供する汎用コンポーネント
 * 
 * @example
 * ```tsx
 * <CsvImportExport
 *   data={scenarios}
 *   onImport={handleImport}
 *   isImporting={isImporting}
 *   exportFilename="scenarios"
 *   headers={['タイトル', '作者']}
 *   rowMapper={(s) => [s.title, s.author]}
 * />
 * ```
 */
export function CsvImportExport<T>({
  onImport,
  isImporting,
  importLabel = 'インポート',
  data,
  exportFilename,
  headers,
  rowMapper,
  exportLabel = 'エクスポート',
  size = 'sm',
  className = ''
}: CsvImportExportProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      await onImport(file)
    } catch (error) {
      logger.error('Import error:', error)
    } finally {
      // ファイル選択をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleExport = () => {
    try {
      const rows = data.map(item => rowMapper(item))
      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n')
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${exportFilename}_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (error) {
      logger.error('Export error:', error)
      showToast.error('エクスポートに失敗しました')
    }
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      
      <Button
        variant="outline"
        size={size}
        onClick={handleImportClick}
        disabled={isImporting}
        title="CSVインポート"
      >
        <Upload className="h-4 w-4 mr-2" />
        {isImporting ? 'インポート中...' : importLabel}
      </Button>
      
      <Button
        variant="outline"
        size={size}
        onClick={handleExport}
        title="CSVエクスポート"
        disabled={data.length === 0}
      >
        <Download className="h-4 w-4 mr-2" />
        {exportLabel}
      </Button>
    </div>
  )
}

