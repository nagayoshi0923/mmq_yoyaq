import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpButton } from '@/components/ui/help-button'
import type { Scenario } from '@/types'
import { Plus, BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScenarioEditDialogV2 } from '@/components/modals/ScenarioEditDialogV2'

// 分離されたコンポーネント
import { OrganizationScenarioList } from './components/OrganizationScenarioList'
import { CsvImportExport } from '@/components/features/CsvImportExport'

// 分離されたフック
import { useScenarioFilters } from './hooks/useScenarioFilters'
import { useImportScenariosMutation } from './hooks/useScenarioQuery'
import { useOrganizationScenariosQuery } from './hooks/useOrganizationScenariosQuery'
import { useQueryClient } from '@tanstack/react-query'

import { showToast } from '@/utils/toast'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'

export function ScenarioManagement() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const canEditScenarios = isAdmin
  const { organization } = useOrganization()

  // UI状態
  const [isImporting, setIsImporting] = useState(false)

  // 編集モーダル状態
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null)

  // 旧ルート（/scenarios/edit/:id）などからの受け口: ?edit=<scenarioId|new>
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const edit = params.get('edit')
    if (!edit) return

    if (!canEditScenarios) {
      params.delete('edit')
      const nextSearch = params.toString()
      navigate(
        nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname,
        { replace: true }
      )
      return
    }

    // 開く
    setEditingScenarioId(edit === 'new' ? null : edit)
    setEditDialogOpen(true)

    // パラメータを消してURLをクリーンにする（再オープン防止）
    params.delete('edit')
    const nextSearch = params.toString()
    navigate(
      nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname,
      { replace: true }
    )
  }, [canEditScenarios, location.pathname, location.search, navigate])
  
  // 組織シナリオリストからの編集（useCallbackで安定化）
  const handleEditFromOrgList = useCallback((id: string) => {
    setEditingScenarioId(id)
    setEditDialogOpen(true)
  }, [])
  
  // React Query でデータ管理
  const queryClient = useQueryClient()

  // OrganizationScenarioList と同一クエリキーを使うため重複フェッチなし
  const {
    data: orgScenariosData,
    isPending: scenariosPending,
  } = useOrganizationScenariosQuery(organization?.id)

  // isPending: disabled時・初回fetch中・retry中すべて true。data受信またはretry上限でfalse
  const loading = scenariosPending

  const allScenarios = (orgScenariosData?.scenarios ?? []) as unknown as Scenario[]

  const importScenariosMutation = useImportScenariosMutation()

  // 初回ロード完了フラグ（スクロール復元用）
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

  // フィルタとソート（編集ダイアログの前後ナビゲーション順序に使用）
  const { filteredAndSortedScenarios } = useScenarioFilters(allScenarios, {})

  function handleNewScenario() {
    setEditingScenarioId(null)
    setEditDialogOpen(true)
  }
  
  function handleCloseEditDialog() {
    setEditDialogOpen(false)
    setEditingScenarioId(null)
    // 組織シナリオ一覧とオプションキャッシュを無効化
    queryClient.invalidateQueries({ queryKey: ['org-scenarios', 'list'] })
    queryClient.invalidateQueries({ queryKey: ['org-scenarios-options'] })
  }
  
  // CSVインポート処理
  async function handleImport(file: File) {
    setIsImporting(true)
    try {
      const result = await importScenariosMutation.mutateAsync(file)
      showToast.success(`${result.count}件のシナリオをインポートしました`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      showToast.error(message)
      throw err // CsvImportExport コンポーネントでエラーハンドリング
    } finally {
      setIsImporting(false)
    }
  }
  
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
      clearTimeout(scrollTimer)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // 初回レンダリング時のスクロール位置復元（早期）
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    const savedY = sessionStorage.getItem('scenarioScrollY')
    const savedTime = sessionStorage.getItem('scenarioScrollTime')
    if (savedY && savedTime) {
      const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
      if (timeSinceScroll < 10000) {
        timer = setTimeout(() => {
          window.scrollTo(0, parseInt(savedY, 10))
        }, 100)
      }
    }
    return () => { if (timer) clearTimeout(timer) }
  }, [])

  // 初回データロード後のスクロール位置復元（初回のみ）
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    if (!loading && !initialLoadComplete) {
      setInitialLoadComplete(true)
      const savedY = sessionStorage.getItem('scenarioScrollY')
      const savedTime = sessionStorage.getItem('scenarioScrollTime')
      if (savedY && savedTime) {
        const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
        if (timeSinceScroll < 10000) {
          timer = setTimeout(() => {
            window.scrollTo(0, parseInt(savedY, 10))
          }, 200)
        }
      }
    }
    return () => { if (timer) clearTimeout(timer) }
  }, [loading, initialLoadComplete, setInitialLoadComplete])

  if (loading) {
    return (
      <AppLayout currentPage="scenarios" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground text-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            読み込み中...
          </div>
        </div>
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
        <div className="space-y-6">
          <PageHeader
            title={
              <>
                <BookOpen className="h-5 w-5 text-primary" />
                {organization?.name ? `${organization.name}のシナリオ管理` : 'シナリオ管理'}
              </>
            }
            description={`全${allScenarios.length}本のシナリオを管理`}
          >
            <HelpButton topic="scenario" label="シナリオ管理マニュアル" />
          </PageHeader>

          <div className="flex items-center justify-between">
            {/* 凡例（マスタ由来 / 組織設定） */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-gray-100 border rounded"></span>
                マスタ由来
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></span>
                組織設定
              </span>
              {!canEditScenarios && <Badge variant="outline" className="text-xs">閲覧専用</Badge>}
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              {canEditScenarios && (
                <>
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
                    <Plus className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">新規シナリオ</span>
                    <span className="sm:hidden">新規</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* マスタ連携シナリオ一覧 */}
          <OrganizationScenarioList
            onEdit={canEditScenarios ? handleEditFromOrgList : undefined}
            canEdit={canEditScenarios}
          />
        </div>

        {/* シナリオ編集ダイアログ */}
        <ScenarioEditDialogV2
          isOpen={editDialogOpen}
          onClose={handleCloseEditDialog}
          scenarioId={editingScenarioId}
          onScenarioChange={setEditingScenarioId}
          sortedScenarioIds={filteredAndSortedScenarios.map(s => s.id)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['org-scenarios', 'list'] })
            queryClient.invalidateQueries({ queryKey: ['org-scenarios-options'] })
          }}
        />
      </AppLayout>
    )
}
