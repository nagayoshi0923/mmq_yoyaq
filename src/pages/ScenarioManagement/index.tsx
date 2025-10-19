import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScenarioEditModal } from '@/components/modals/ScenarioEditModal'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import type { Scenario } from '@/types'
import { 
  BookOpen, 
  Plus, 
  RefreshCw,
  Upload,
  Download,
  AlertTriangle
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// 分離されたコンポーネント
import { ScenarioStats } from './components/ScenarioStats'
import { ScenarioFilters } from './components/ScenarioFilters'
import { ScenarioTableHeader } from './components/ScenarioTableHeader'
import { ScenarioTableRow } from './components/ScenarioTableRow'

// 分離されたフック
import { useScenarioData } from './hooks/useScenarioData'
import { useScenarioFilters } from './hooks/useScenarioFilters'

export function ScenarioManagement() {
  // データ管理
  const {
    scenarios,
    loading,
    initialLoadComplete,
    setInitialLoadComplete,
    error,
    loadScenarios,
    saveScenario,
    deleteScenario,
    importFromCSV,
    exportToCSV
  } = useScenarioData()

  // フィルタとソート
  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    sortState,
    handleSort,
    filteredAndSortedScenarios
  } = useScenarioFilters(scenarios)

  // UI状態
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [displayMode, setDisplayMode] = useState<'compact' | 'detailed'>('compact')
  const [isImporting, setIsImporting] = useState(false)
  
  // 削除確認ダイアログ用のstate
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scenarioToDelete, setScenarioToDelete] = useState<Scenario | null>(null)
  
  // ファイルインput参照
  const fileInputRef = useRef<HTMLInputElement>(null)

  // スクロール位置の保存と復元
  useEffect(() => {
    // ブラウザのデフォルトスクロール復元を無効化
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    let scrollTimer: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        sessionStorage.setItem('scenarioScrollY', window.scrollY.toString())
        sessionStorage.setItem('scenarioScrollTime', Date.now().toString())
      }, 100)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // 初回レンダリング時のスクロール位置復元（早期）
  useLayoutEffect(() => {
    const savedY = sessionStorage.getItem('scenarioScrollY')
    const savedTime = sessionStorage.getItem('scenarioScrollTime')
    if (savedY && savedTime) {
      const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
      if (timeSinceScroll < 10000) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedY, 10))
        }, 100)
      }
    }
  }, [])

  // 初回データロード後のスクロール位置復元（初回のみ）
  useEffect(() => {
    if (!loading && !initialLoadComplete) {
      setInitialLoadComplete(true)
      const savedY = sessionStorage.getItem('scenarioScrollY')
      const savedTime = sessionStorage.getItem('scenarioScrollTime')
      if (savedY && savedTime) {
        const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
        if (timeSinceScroll < 10000) {
          setTimeout(() => {
            window.scrollTo(0, parseInt(savedY, 10))
          }, 200)
        }
      }
    }
  }, [loading, initialLoadComplete, setInitialLoadComplete])

  // イベントハンドラー
  function handleEditScenario(scenario: Scenario) {
    setEditingScenario(scenario)
    setIsEditModalOpen(true)
  }

  function handleNewScenario() {
    setEditingScenario(null)
    setIsEditModalOpen(true)
  }

  async function handleSaveScenario(scenario: Scenario) {
    try {
      await saveScenario(scenario, !!editingScenario)
      setIsEditModalOpen(false)
      setEditingScenario(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert(message)
    }
  }

  function openDeleteDialog(scenario: Scenario) {
    setScenarioToDelete(scenario)
    setDeleteDialogOpen(true)
  }

  async function confirmDelete() {
    if (!scenarioToDelete) return

    try {
      await deleteScenario(scenarioToDelete.id)
      setDeleteDialogOpen(false)
      setScenarioToDelete(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert(message)
    }
  }

  async function handleImport() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsImporting(true)
      const result = await importFromCSV(file)
      if (result.success) {
        alert(`${result.count}件のシナリオをインポートしました`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert(message)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function handleExport() {
    try {
      exportToCSV()
      alert('シナリオをCSVファイルにエクスポートしました')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert(message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="scenarios" />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="scenarios" />

      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="h-8 w-8" />
              <h1 className="text-3xl font-bold">シナリオ管理</h1>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadScenarios(true)}
                title="更新"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImport}
                disabled={isImporting}
                title="CSVインポート"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isImporting ? 'インポート中...' : 'インポート'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                title="CSVエクスポート"
              >
                <Download className="h-4 w-4 mr-2" />
                エクスポート
              </Button>
              <Button onClick={handleNewScenario}>
                <Plus className="h-4 w-4 mr-2" />
                新規シナリオ
              </Button>
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <Card className="border-red-500 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-5 w-5" />
                  <p>{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 統計情報 */}
          <ScenarioStats scenarios={scenarios} />

          {/* 検索・フィルター */}
          <div className="flex justify-between items-center gap-4">
            <ScenarioFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
            
            {/* 表示切り替えボタン */}
            <div className="flex items-center gap-2">
              <Button
                variant={displayMode === 'compact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisplayMode('compact')}
              >
                基本情報
              </Button>
              <Button
                variant={displayMode === 'detailed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisplayMode('detailed')}
              >
                詳細情報
              </Button>
            </div>
          </div>

          {/* テーブル */}
          <div className="space-y-2">
            {/* ヘッダー */}
            <ScenarioTableHeader
              displayMode={displayMode}
              sortState={sortState}
              onSort={handleSort}
            />

            {/* データ行 */}
            {filteredAndSortedScenarios.length > 0 ? (
              <div className="space-y-1">
                {filteredAndSortedScenarios.map((scenario) => (
                  <ScenarioTableRow
                    key={scenario.id}
                    scenario={scenario}
                    displayMode={displayMode}
                    onEdit={handleEditScenario}
                    onDelete={openDeleteDialog}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchTerm || statusFilter !== 'all' 
                      ? '検索条件に一致するシナリオが見つかりません' 
                      : 'シナリオが登録されていません'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* 編集モーダル */}
      {isEditModalOpen && (
        <ScenarioEditModal
          open={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            setEditingScenario(null)
          }}
          scenario={editingScenario}
          onSave={handleSaveScenario}
        />
      )}

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>シナリオを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {scenarioToDelete && (
                <>
                  「{scenarioToDelete.title}」を削除します。この操作は取り消せません。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
