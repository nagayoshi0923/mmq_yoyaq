import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { StaffManual } from './StaffManual'
import { ReservationManual } from './ReservationManual'
import { ShiftManual } from './ShiftManual'
import { CouponManual } from './CouponManual'
import { CouponReceptionManual } from './CouponReceptionManual'
import { CouponTypeManual } from './CouponTypeManual'
import { CheckinManual } from './CheckinManual'
import { PreReadingSurveyManual } from './PreReadingSurveyManual'
import { ManualEditor } from './editor/ManualEditor'
import { HardcodedPageEditor } from './editor/HardcodedPageEditor'
import { BlockListRenderer } from './renderer/BlockRenderer'
import { manualPageApi } from '@/lib/api/manualApi'
import { cn } from '@/lib/utils'
import type { ManualPage, ManualPageWithBlocks } from '@/types/manual'
import type { HardcodedPageContent, CouponTypePageContent } from '@/types/hardcodedContent'
import {
  BookOpen, Users, CalendarDays, FileText, Ticket, Scissors,
  ClipboardCheck, ClipboardList, ChevronDown, ChevronRight,
  Menu, X, Plus, Pencil, LayoutTemplate,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// ハードコードページ定義（既存の React コンポーネントページ）
// ※ DB に同名 slug のページが存在 かつ page_content == null の場合はサイドバーから非表示
// ---------------------------------------------------------------------------
const ALL_HARDCODED_STAFF_ITEMS = [
  { id: 'checkin',            label: '受付・チェックイン',      icon: ClipboardCheck },
  { id: 'pre-reading-survey', label: '事前アンケート・配役',     icon: ClipboardList },
  { id: 'coupon-reception',   label: 'クーポン受付対応',        icon: Scissors },
  { id: 'coupon-types',       label: 'クーポン・チケット種類',   icon: Ticket },
]

const ALL_HARDCODED_ADMIN_ITEMS = [
  { id: 'reservation', label: '予約管理',          icon: CalendarDays },
  { id: 'staff',       label: 'スタッフ管理',       icon: Users },
  { id: 'schedule',    label: 'シフト・スケジュール', icon: FileText },
  { id: 'coupon',      label: 'クーポン管理',        icon: Ticket },
]

type HardcodedContentMap = Record<string, HardcodedPageContent | CouponTypePageContent>

function renderHardcoded(id: string, contentMap?: HardcodedContentMap) {
  const content = contentMap?.[id]
  switch (id) {
    case 'staff':
      return <StaffManual content={content as HardcodedPageContent | undefined} />
    case 'reservation':
      return <ReservationManual content={content as HardcodedPageContent | undefined} />
    case 'schedule':
      return <ShiftManual content={content as HardcodedPageContent | undefined} />
    case 'checkin':
      return <CheckinManual content={content as HardcodedPageContent | undefined} />
    case 'pre-reading-survey':
      return <PreReadingSurveyManual content={content as HardcodedPageContent | undefined} />
    case 'coupon-reception':
      return <CouponReceptionManual content={content as HardcodedPageContent | undefined} />
    case 'coupon-types':
      return <CouponTypeManual content={content as CouponTypePageContent | undefined} />
    case 'coupon':
      return <CouponManual content={content as HardcodedPageContent | undefined} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// サイドバー
// ---------------------------------------------------------------------------
interface SidebarProps {
  activeTab: string
  onTabChange: (id: string) => void
  dbStaffPages: ManualPage[]
  dbAdminPages: ManualPage[]
  isAdmin: boolean
  onNewPage: () => void
  onEditPage: (pageId: string) => void
  onClose?: () => void
  // slugs that have a block-based DB page (page_content == null) → hide hardcoded item
  blockBasedSlugs: Set<string>
}

function ManualSidebarContent({
  activeTab, onTabChange, dbStaffPages, dbAdminPages,
  isAdmin, onNewPage, onEditPage, onClose, blockBasedSlugs,
}: SidebarProps) {
  // ハードコードページのうち、block-based DB ページが存在するものを非表示
  const hardcodedStaffItems = ALL_HARDCODED_STAFF_ITEMS.filter(i => !blockBasedSlugs.has(i.id))
  const hardcodedAdminItems = ALL_HARDCODED_ADMIN_ITEMS.filter(i => !blockBasedSlugs.has(i.id))

  const allAdminIds = [...hardcodedAdminItems.map(i => i.id), ...dbAdminPages.map(p => p.id)]
  const isAdminActive = allAdminIds.includes(activeTab)
  const [adminOpen, setAdminOpen] = useState(isAdminActive)

  const handleClick = (id: string) => {
    onTabChange(id)
    onClose?.()
  }

  const SidebarItem = ({
    id, label, Icon, dbPageId,
  }: {
    id: string; label: string; Icon: React.ElementType; dbPageId?: string
  }) => {
    const isActive = activeTab === id
    return (
      <div className="flex items-center group">
        <button
          onClick={() => handleClick(id)}
          className={cn(
            'flex-1 text-left px-4 py-2 flex items-center gap-3 transition-all duration-200',
            isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
          )}
        >
          <Icon className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-blue-700' : 'text-slate-500')} />
          <span className={cn('text-xs font-medium flex-1 text-left', isActive ? 'text-blue-700' : '')}>{label}</span>
        </button>
        {isAdmin && dbPageId && (
          <button
            onClick={() => onEditPage(dbPageId)}
            className="opacity-0 group-hover:opacity-100 pr-2 transition-opacity"
            title="編集"
          >
            <Pencil className="h-3 w-3 text-slate-400 hover:text-blue-600" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">操作マニュアル</h2>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-slate-100 md:hidden">
            <X className="h-5 w-5 text-slate-700" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {/* スタッフ向け: ハードコード（block-based DB未移行分のみ） */}
        {hardcodedStaffItems.map(item => (
          <SidebarItem key={item.id} id={item.id} label={item.label} Icon={item.icon} />
        ))}

        {/* スタッフ向け: DB ページ（block-based のみ） */}
        {dbStaffPages.map(page => (
          <SidebarItem key={page.id} id={page.id} label={page.title} Icon={FileText} dbPageId={page.id} />
        ))}

        {/* 運営セクション（折りたたみ） */}
        <div className="pt-2">
          <button
            onClick={() => setAdminOpen(o => !o)}
            className="w-full text-left px-4 py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wide hover:text-slate-600 transition-colors"
          >
            <span>運営</span>
            {adminOpen
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>

          {adminOpen && (
            <div className="space-y-0 mt-1">
              {hardcodedAdminItems.map(item => (
                <div key={item.id} className="pl-2">
                  <SidebarItem id={item.id} label={item.label} Icon={item.icon} />
                </div>
              ))}
              {dbAdminPages.map(page => (
                <div key={page.id} className="pl-2">
                  <SidebarItem id={page.id} label={page.title} Icon={FileText} dbPageId={page.id} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 新規ページ作成ボタン（管理者のみ） */}
        {isAdmin && (
          <div className="pt-3 px-2">
            <button
              onClick={onNewPage}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-primary hover:bg-primary/5 rounded border border-dashed border-slate-300 hover:border-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              新規ページ作成
            </button>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="text-xs text-slate-500 text-center">項目を選択して閲覧</div>
      </div>
    </div>
  )
}

function ManualSidebar(props: Omit<SidebarProps, 'onClose'>) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-40 p-3 bg-primary text-white hover:bg-primary/90 transition-all hover:scale-110"
        aria-label="メニューを開く"
      >
        <Menu className="h-6 w-6" />
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      <div className="hidden md:flex w-72 bg-white flex-shrink-0 flex-col h-full">
        <ManualSidebarContent {...props} />
      </div>

      <div
        className={cn(
          'md:hidden fixed top-0 left-0 bottom-0 w-72 bg-white z-50 flex flex-col',
          'border-r border-slate-200 shadow-xl transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <ManualSidebarContent {...props} onClose={() => setMobileOpen(false)} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// DB ページビューア
// ---------------------------------------------------------------------------
function DbPageViewer({ pageId, isAdmin, onEdit }: {
  pageId: string
  isAdmin: boolean
  onEdit: () => void
}) {
  const [pageData, setPageData] = useState<ManualPageWithBlocks | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    manualPageApi.getWithBlocks(pageId)
      .then(setPageData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [pageId])

  if (loading) return <div className="text-sm text-muted-foreground py-10 text-center">読み込み中…</div>
  if (error)   return <div className="text-sm text-destructive py-10 text-center">{error}</div>
  if (!pageData) return null

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">{pageData.title}</h2>
          {pageData.description && (
            <p className="text-muted-foreground leading-relaxed">{pageData.description}</p>
          )}
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={onEdit} className="flex-shrink-0">
            <Pencil className="h-4 w-4 mr-1.5" />
            編集
          </Button>
        )}
      </div>

      {pageData.blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm border rounded-xl border-dashed gap-3">
          <p>まだコンテンツがありません</p>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-1.5" />
              編集して追加する
            </Button>
          )}
        </div>
      ) : (
        <BlockListRenderer blocks={pageData.blocks} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// メインページ
// ---------------------------------------------------------------------------

/** ユーザーが管理者かどうかを判定（users テーブルの role を参照） */
function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) return
        supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single()
          .then(({ data: u }) => {
            setIsAdmin(u?.role === 'admin')
          })
      })
    })
  }, [])
  return isAdmin
}

type EditorMode =
  | { type: 'view' }
  | { type: 'new' }
  | { type: 'edit'; pageId: string }
  | { type: 'edit-content'; slug: string }

export function ManualPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = useIsAdmin()

  // DB ページ一覧
  const [dbPages, setDbPages] = useState<ManualPage[]>([])
  const loadDbPages = () => {
    manualPageApi.list()
      .then(setDbPages)
      .catch(() => {/* 権限なし等は無視 */})
  }
  useEffect(() => { loadDbPages() }, [])

  // Build content override map from DB pages that have page_content
  // page_content != null → content override for hardcoded component
  // page_content == null → block-based page
  const hardcodedContentMap: HardcodedContentMap = {}
  const blockBasedSlugs = new Set<string>()

  for (const page of dbPages) {
    if (page.page_content != null) {
      hardcodedContentMap[page.slug] = page.page_content as HardcodedPageContent | CouponTypePageContent
    } else {
      blockBasedSlugs.add(page.slug)
    }
  }

  // block-based DB pages to show in sidebar (exclude content-override-only rows)
  const dbStaffPages = dbPages.filter(p => p.category === 'staff' && p.page_content == null)
  const dbAdminPages = dbPages.filter(p => p.category === 'admin' && p.page_content == null)

  // DB ページを slug → id で引けるマップ（旧スラッグの URL リダイレクト用）
  const dbPageBySlug = Object.fromEntries(dbPages.filter(p => p.page_content == null).map(p => [p.slug, p]))

  // タブ状態
  const allHardcodedIds = [
    ...ALL_HARDCODED_STAFF_ITEMS.map(i => i.id),
    ...ALL_HARDCODED_ADMIN_ITEMS.map(i => i.id),
  ]
  const tabParam = searchParams.get('tab')
  const defaultTab = ALL_HARDCODED_STAFF_ITEMS[0]?.id ?? ''
  const resolveTab = (raw: string | null): string => {
    if (!raw) return defaultTab
    if (dbPages.some(p => p.id === raw && p.page_content == null)) return raw   // DB block page UUID
    if (dbPageBySlug[raw]) return dbPageBySlug[raw].id // 旧スラッグ → DB UUID
    if (allHardcodedIds.includes(raw)) return raw      // ハードコード ID
    return defaultTab
  }
  const [activeTab, setActiveTab] = useState(() => resolveTab(tabParam))

  // エディターモード
  const [editorMode, setEditorMode] = useState<EditorMode>({ type: 'view' })

  const handleTabChange = (id: string) => {
    setActiveTab(id)
    setSearchParams({ tab: id }, { replace: true })
    setEditorMode({ type: 'view' })
    window.scrollTo(0, 0)
  }

  const handleEditorDone = (savedPage: ManualPage) => {
    loadDbPages()
    setEditorMode({ type: 'view' })
    handleTabChange(savedPage.id)
  }

  const handleContentSaved = async () => {
    loadDbPages()
    setEditorMode({ type: 'view' })
  }

  const renderContent = () => {
    // エディターモード
    if (editorMode.type === 'new') {
      return (
        <ManualEditor
          onDone={handleEditorDone}
          onCancel={() => setEditorMode({ type: 'view' })}
        />
      )
    }
    if (editorMode.type === 'edit') {
      return (
        <ManualEditor
          pageId={editorMode.pageId}
          onDone={handleEditorDone}
          onCancel={() => setEditorMode({ type: 'view' })}
        />
      )
    }

    // DB block-based ページ
    const dbPage = dbPages.find(p => p.id === activeTab && p.page_content == null)
    if (dbPage) {
      return (
        <DbPageViewer
          pageId={dbPage.id}
          isAdmin={isAdmin}
          onEdit={() => setEditorMode({ type: 'edit', pageId: dbPage.id })}
        />
      )
    }

    // ハードコードページ（content override があれば渡す）
    const hardcodedContent = hardcodedContentMap[activeTab]
    return (
      <div className="relative">
        {isAdmin && (
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditorMode({ type: 'edit-content', slug: activeTab })}
            >
              <LayoutTemplate className="h-4 w-4 mr-1.5" />
              コンテンツを編集
            </Button>
          </div>
        )}
        {renderHardcoded(activeTab, hardcodedContent ? { [activeTab]: hardcodedContent } : undefined) ?? <ReservationManual />}

        {/* コンテンツ編集ダイアログ */}
        {editorMode.type === 'edit-content' && editorMode.slug === activeTab && (
          <HardcodedPageEditor
            slug={activeTab}
            initialContent={hardcodedContent ?? null}
            onSave={async (content) => {
              await manualPageApi.saveHardcodedContent(activeTab, content)
              await handleContentSaved()
            }}
            onCancel={() => setEditorMode({ type: 'view' })}
          />
        )}
      </div>
    )
  }

  return (
    <AppLayout
      currentPage="manual"
      sidebar={
        <ManualSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          dbStaffPages={dbStaffPages}
          dbAdminPages={dbAdminPages}
          isAdmin={isAdmin}
          onNewPage={() => setEditorMode({ type: 'new' })}
          onEditPage={pageId => setEditorMode({ type: 'edit', pageId })}
          blockBasedSlugs={blockBasedSlugs}
        />
      }
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-6">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">操作マニュアル</span>
            </div>
          }
          description="システムの操作方法と使用シーンについてのガイド"
        />
        {renderContent()}
      </div>
    </AppLayout>
  )
}
