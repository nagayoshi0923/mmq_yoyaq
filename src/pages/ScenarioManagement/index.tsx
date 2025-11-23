import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import type { Scenario } from '@/types'
import { 
  Plus, 
  AlertTriangle
} from 'lucide-react'
import { ConfirmModal } from '@/components/patterns/modal'
import { TanStackDataTable } from '@/components/patterns/table'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'

// 分離されたコンポーネント
import { ScenarioStats } from './components/ScenarioStats'
import { ScenarioFilters } from './components/ScenarioFilters'
import { CsvImportExport } from '@/components/features/CsvImportExport'

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
  const [displayMode, setDisplayMode] = useState<'compact' | 'detailed'>('compact')
  const [isImporting, setIsImporting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scenarioToDelete, setScenarioToDelete] = useState<Scenario | null>(null)
  const [useInfiniteScroll] = useState(true) // 無限スクロールのON/OFF（将来的に切り替え機能を追加予定）
  
  // 編集モーダル状態
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null)
  
  // スクロール監視用
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null)

  // React Query でデータ管理
  const queryClient = useQueryClient()
  
  // 全件取得版（常に全データを取得してフィルタ・ソートに対応）
  const {
    data: allScenarios = [],
    isLoading: loading,
    error: queryError
  } = useScenariosQuery()
  
  const deleteScenarioMutation = useDeleteScenarioMutation()
  const importScenariosMutation = useImportScenariosMutation()
  
  // 表示用：段階的に表示する件数を管理
  const [displayCount, setDisplayCount] = useState(20)
  
  // エラーメッセージ
  const error = queryError ? (queryError as Error).message : ''
  
  // 初回ロード完了フラグ（スクロール復元用）
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

  // フィルタとソート（全データに対して実行）
  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    sortState,
    handleSort,
    filteredAndSortedScenarios
  } = useScenarioFilters(allScenarios)
  
  // 表示用：フィルタ・ソート後のデータから表示件数分だけ切り出す
  const displayedScenarios = useMemo(() => {
    return filteredAndSortedScenarios.slice(0, displayCount)
  }, [filteredAndSortedScenarios, displayCount])
  
  const hasMore = displayCount < filteredAndSortedScenarios.length
  
  // 段階的表示：Intersection Observer でスクロール監視
  useEffect(() => {
    if (!useInfiniteScroll || !loadMoreTriggerRef.current || !hasMore) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        // トリガー要素が見えたら表示件数を増やす
        if (entries[0].isIntersecting && hasMore) {
          setDisplayCount(prev => Math.min(prev + 20, filteredAndSortedScenarios.length))
        }
      },
      { threshold: 0.1 }
    )
    
    observer.observe(loadMoreTriggerRef.current)
    
    return () => observer.disconnect()
  }, [useInfiniteScroll, hasMore, filteredAndSortedScenarios.length])
  
  // フィルタやソートが変更されたら表示件数をリセット
  useEffect(() => {
    setDisplayCount(20)
  }, [searchTerm, statusFilter, sortState])

  // シナリオ編集ダイアログを開く
  function handleEditScenario(scenario: Scenario) {
    setEditingScenarioId(scenario.id)
    setEditDialogOpen(true)
  }

  function handleNewScenario() {
    setEditingScenarioId(null)
    setEditDialogOpen(true)
  }
  
  function handleCloseEditDialog() {
    setEditDialogOpen(false)
    setEditingScenarioId(null)
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

  // CSVインポート処理
  async function handleImport(file: File) {
    setIsImporting(true)
    try {
      const result = await importScenariosMutation.mutateAsync(file)
      alert(`${result.count}件のシナリオをインポートしました`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert(message)
      throw err // CsvImportExport コンポーネントでエラーハンドリング
    } finally {
      setIsImporting(false)
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
  useEffect(() => {
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
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      className="mx-auto"
    >
        <div className="space-y-3 sm:space-y-4 md:space-y-6">
          <PageHeader
            title="シナリオ管理"
            description={`全${allScenarios.length}本のシナリオを管理`}
          >
            <CsvImportExport
              data={allScenarios}
              onImport={handleImport}
              isImporting={isImporting}
              exportFilename="scenarios"
              headers={['タイトル', '作者', '説明', '所要時間(分)', '最小人数', '最大人数', '難易度', '参加費']}
              rowMapper={(s) => [
                s.title,
                s.author,
                s.description || '',
                s.duration.toString(),
                s.player_count_min.toString(),
                s.player_count_max?.toString() || s.player_count_min.toString(),
                s.difficulty?.toString() || '3',
                s.participation_fee?.toString() || '3000'
              ]}
            />
            <Button onClick={handleNewScenario} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              新規シナリオ
            </Button>
          </PageHeader>

          {/* エラー表示 */}
          {error && (
            <Card className="border-red-500 bg-red-50">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2 text-red-800 text-sm sm:text-base">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <p className="break-words">{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 統計情報 */}
          <ScenarioStats scenarios={allScenarios} />

          {/* 検索・フィルター */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-3 md:gap-4">
            <ScenarioFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
            
            {/* 表示切り替えボタン */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant={displayMode === 'compact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisplayMode('compact')}
                className="text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">基本情報</span>
                <span className="sm:hidden">基本</span>
              </Button>
              <Button
                variant={displayMode === 'detailed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisplayMode('detailed')}
                className="text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">詳細情報</span>
                <span className="sm:hidden">詳細</span>
              </Button>
            </div>
          </div>

          {/* テーブル */}
          <TanStackDataTable
            data={displayedScenarios}
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
          
          {/* 段階的表示：トリガー要素 */}
          {useInfiniteScroll && hasMore && (
            <div 
              ref={loadMoreTriggerRef}
              className="flex justify-center py-4"
            >
              <Button
                variant="outline"
                onClick={() => setDisplayCount(prev => Math.min(prev + 20, filteredAndSortedScenarios.length))}
              >
                さらに表示 ({displayedScenarios.length} / {filteredAndSortedScenarios.length})
              </Button>
            </div>
          )}
          
          {/* データ表示状況 */}
          {useInfiniteScroll && !hasMore && displayedScenarios.length > 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground">
              {filteredAndSortedScenarios.length === allScenarios.length ? (
                `全${allScenarios.length}件のシナリオを表示しています`
              ) : (
                `フィルタ結果：${filteredAndSortedScenarios.length}件のシナリオを表示しています（全体：${allScenarios.length}件）`
              )}
            </div>
          )}
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

        {/* シナリオ編集ダイアログ */}
        <ScenarioEditDialog
          isOpen={editDialogOpen}
          onClose={handleCloseEditDialog}
          scenarioId={editingScenarioId}
        />
      </AppLayout>
    )
}
