import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import ScenarioSidebar from '@/components/layout/ScenarioSidebar'
import type { Scenario } from '@/types'
import { 
  BookOpen, 
  Plus, 
  Upload,
  Download,
  AlertTriangle
} from 'lucide-react'
import { ConfirmModal } from '@/components/patterns/modal'
import { TanStackDataTable } from '@/components/patterns/table'

// 分離されたコンポーネント
import { ScenarioStats } from './components/ScenarioStats'
import { ScenarioFilters } from './components/ScenarioFilters'

// 分離されたフック
import { useScenarioFilters } from './hooks/useScenarioFilters'
import {
  useScenariosQuery,
  useDeleteScenarioMutation,
  useImportScenariosMutation
} from './hooks/useScenarioQuery'
import { useQueryClient } from '@tanstack/react-query'

// テーブル列定義
import { createScenarioColumns } from './utils/tableColumns'

// 画像アップロード
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export function ScenarioManagement() {
  // UI状態
  const [activeTab, setActiveTab] = useState('scenario-list')
  const [displayMode, setDisplayMode] = useState<'compact' | 'detailed'>('compact')
  const [isImporting, setIsImporting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scenarioToDelete, setScenarioToDelete] = useState<Scenario | null>(null)
  
  // ファイルインput参照
  const fileInputRef = useRef<HTMLInputElement>(null)

  // React Query でデータ管理
  const queryClient = useQueryClient()
  const { data: scenarios = [], isLoading: loading, error: queryError } = useScenariosQuery()
  const deleteScenarioMutation = useDeleteScenarioMutation()
  const importScenariosMutation = useImportScenariosMutation()
  
  // エラーメッセージ
  const error = queryError ? (queryError as Error).message : ''
  
  // 初回ロード完了フラグ（スクロール復元用）
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

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

  // シナリオ編集ページへ遷移
  function handleEditScenario(scenario: Scenario) {
    setActiveTab('scenario-edit')
    // シナリオIDをハッシュに設定して遷移
    window.location.hash = `scenarios/edit/${scenario.id}`
  }

  function handleNewScenario() {
    setActiveTab('new-scenario')
    // 新規作成ページへ遷移
    window.location.hash = 'scenarios/edit/new'
  }
  
  // 画像アップロードハンドラー
  async function handleImageUpload(scenario: Scenario, file: File) {
    // バリデーション
    const validation = validateImageFile(file, 5)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    try {
      // 画像をアップロード
      const result = await uploadImage(file, 'key-visuals')
      if (!result) {
        alert('画像のアップロードに失敗しました')
        return
      }

      // データベースを更新
      const { error } = await supabase
        .from('scenarios')
        .update({ key_visual_url: result.url })
        .eq('id', scenario.id)

      if (error) {
        logger.error('画像URL更新エラー:', error)
        alert('画像の保存に失敗しました')
        return
      }

      // React Query のキャッシュを直接更新
      queryClient.setQueryData(['scenarios'], (oldData: Scenario[] | undefined) => {
        if (!oldData) return oldData
        return oldData.map(s => 
          s.id === scenario.id 
            ? { ...s, key_visual_url: result.url }
            : s
        )
      })
    } catch (error) {
      logger.error('画像アップロードエラー:', error)
      alert('画像のアップロードに失敗しました')
    }
  }

  // 画像削除ハンドラー
  async function handleImageRemove(scenario: Scenario) {
    if (!confirm('画像を削除しますか？')) return

    try {
      // データベースを更新
      const { error } = await supabase
        .from('scenarios')
        .update({ key_visual_url: null })
        .eq('id', scenario.id)

      if (error) {
        logger.error('画像削除エラー:', error)
        alert('画像の削除に失敗しました')
        return
      }

      // React Query のキャッシュを直接更新
      queryClient.setQueryData(['scenarios'], (oldData: Scenario[] | undefined) => {
        if (!oldData) return oldData
        return oldData.map(s => 
          s.id === scenario.id 
            ? { ...s, key_visual_url: undefined }
            : s
        )
      })
    } catch (error) {
      logger.error('画像削除エラー:', error)
      alert('画像の削除に失敗しました')
    }
  }

  function openDeleteDialog(scenario: Scenario) {
    setScenarioToDelete(scenario)
    setDeleteDialogOpen(true)
  }

  async function confirmDelete() {
    if (!scenarioToDelete) return

    try {
      await deleteScenarioMutation.mutateAsync(scenarioToDelete.id)
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
      const result = await importScenariosMutation.mutateAsync(file)
      alert(`${result.count}件のシナリオをインポートしました`)
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
      // CSVエクスポート（React Query不要）
      const headers = ['タイトル', '作者', '説明', '所要時間(分)', '最小人数', '最大人数', '難易度', '参加費']
      const rows = scenarios.map(s => [
        s.title,
        s.author,
        s.description || '',
        s.duration.toString(),
        s.player_count_min.toString(),
        s.player_count_max?.toString() || s.player_count_min.toString(),
        s.difficulty?.toString() || '3',
        s.participation_fee?.toString() || '3000'
      ])
      
      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `scenarios_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      
      alert('シナリオをCSVファイルにエクスポートしました')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert(message)
    }
  }
  
  // テーブル列定義（useMemoは常に呼ばれる位置に）
  const tableColumns = useMemo(() => createScenarioColumns(displayMode, {
    onEdit: handleEditScenario,
    onDelete: openDeleteDialog,
    onImageUpload: handleImageUpload,
    onImageRemove: handleImageRemove
  }), [displayMode])

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

  if (loading) {
    return (
      <AppLayout currentPage="scenarios">
        <div className="text-center">読み込み中...</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      currentPage="scenarios"
      sidebar={<ScenarioSidebar activeTab={activeTab} onTabChange={setActiveTab} mode="list" />}
      maxWidth="max-w-[1600px]"
      containerPadding="px-4 py-8"
      stickyLayout={true}
    >
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="h-8 w-8" />
              <h1 className="text-3xl font-bold">シナリオ管理</h1>
            </div>
            <div className="flex gap-2">
              {/* React Query が自動で再取得するため、更新ボタンは不要 */}
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
          <TanStackDataTable
            data={filteredAndSortedScenarios}
            columns={tableColumns}
            getRowKey={(scenario) => scenario.id}
            sortState={sortState}
            onSort={handleSort}
            emptyMessage={
              searchTerm || statusFilter !== 'all' 
                ? '検索条件に一致するシナリオが見つかりません' 
                : 'シナリオが登録されていません'
            }
            loading={loading}
          />
        </div>

        {/* 削除確認ダイアログ */}
        <ConfirmModal
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="シナリオを削除"
        message={scenarioToDelete ? `「${scenarioToDelete.title}」を削除します。この操作は取り消せません。` : ''}
        variant="danger"
        confirmLabel="削除"
      />
    </AppLayout>
  )
}
