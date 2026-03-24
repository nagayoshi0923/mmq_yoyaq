/**
 * UIコンポーネントギャラリー
 * @path /dev/components
 * @purpose 全UIコンポーネントのプレビュー・調整用ページ
 * 
 * このページでUIパーツのデザインを調整すると、
 * 全ての使用箇所に反映されます。
 */
import { useState, useEffect, useCallback } from 'react'
import { 
  ChevronDown, Check, AlertCircle, Info, Search, Plus, Trash2, Edit, 
  Calendar, Clock, Users, Building2, Star, Heart, Settings, Copy,
  ExternalLink, Download, Upload, RefreshCw, X, Menu, ArrowRight,
  Bell, LogOut, User, Loader2, ChevronRight, Home, BookOpen, 
  LayoutDashboard, Shield, FileCheck, HelpCircle, Sparkles, Filter
} from 'lucide-react'

// テーマ
import { MYPAGE_THEME as THEME, BOOKING_THEME } from '@/lib/theme'

// UIコンポーネントのインポート
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusBadge } from '@/components/ui/status-badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

// セクションコンポーネント
function Section({ 
  id, 
  title, 
  description, 
  children 
}: { 
  id: string
  title: string
  description: string
  children: React.ReactNode 
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <div className="mb-6 border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{title}</h2>
        <p className="text-sm text-gray-500 font-mono">{description}</p>
      </div>
      {children}
    </section>
  )
}

// サブセクションコンポーネント
function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

// コンポーネントボックス
function ComponentBox({ label, children, className = '' }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-4 bg-white border border-gray-200 rounded-lg ${className}`}>
      {label && <div className="text-xs text-gray-400 mb-3 font-mono">{label}</div>}
      <div className="flex flex-wrap gap-3 items-center">{children}</div>
    </div>
  )
}

// ナビゲーションリンク
const NAV_ITEMS = [
  { id: 'buttons', label: 'ボタン', category: 'UI基本' },
  { id: 'badges', label: 'バッジ', category: 'UI基本' },
  { id: 'inputs', label: '入力フォーム', category: 'UI基本' },
  { id: 'selects', label: '選択', category: 'UI基本' },
  { id: 'cards', label: 'カード', category: 'UI基本' },
  { id: 'tabs', label: 'タブ', category: 'UI基本' },
  { id: 'dialogs', label: 'ダイアログ', category: 'オーバーレイ' },
  { id: 'sheets', label: 'シート', category: 'オーバーレイ' },
  { id: 'popovers', label: 'ポップオーバー', category: 'オーバーレイ' },
  { id: 'alerts', label: 'アラート', category: 'フィードバック' },
  { id: 'tooltips', label: 'ツールチップ', category: 'フィードバック' },
  { id: 'tables', label: 'テーブル', category: 'データ表示' },
  { id: 'status', label: 'ステータス', category: 'データ表示' },
  { id: 'sentry', label: 'Sentry', category: '開発ツール' },
  { id: 'hero', label: 'ヒーロー', category: 'トップページ' },
  { id: 'scenario-card', label: 'シナリオカード', category: 'トップページ' },
  { id: 'store-card', label: '店舗カード', category: 'トップページ' },
  { id: 'cta', label: 'CTA', category: 'トップページ' },
  { id: 'search', label: '検索バー', category: 'トップページ' },
  { id: 'layout', label: 'レイアウト', category: 'ページ構造' },
  { id: 'navigation', label: 'ナビゲーション', category: 'ページ構造' },
  { id: 'loading', label: 'ローディング', category: 'ページ構造' },
  { id: 'icons', label: 'アイコン', category: 'その他' },
  { id: 'colors', label: 'カラー', category: 'その他' },
  { id: 'theme', label: 'テーマ', category: 'その他' },
  { id: 'typography', label: 'タイポグラフィ', category: 'その他' },
]

// カテゴリでグループ化
const groupedNavItems = NAV_ITEMS.reduce((acc, item) => {
  if (!acc[item.category]) {
    acc[item.category] = []
  }
  acc[item.category].push(item)
  return acc
}, {} as Record<string, typeof NAV_ITEMS>)

export function ComponentGallery() {
  const [activeSection, setActiveSection] = useState('buttons')

  // セクションへスクロール
  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(id)
    }
  }, [])

  // スクロール時にアクティブセクションを更新
  useEffect(() => {
    const handleScroll = () => {
      const sections = NAV_ITEMS.map(item => document.getElementById(item.id)).filter(Boolean)
      
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i]
        if (section) {
          const rect = section.getBoundingClientRect()
          if (rect.top <= 120) {
            setActiveSection(section.id)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50">
        {/* ヘッダー */}
        <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">🎨 UIコンポーネントギャラリー</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  全UIパーツのデザインを管理・調整
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 font-mono">
                  /dev/components
                </span>
                <Button variant="outline" size="sm" onClick={() => window.location.href = '/dev/design-preview'}>
                  カラーデザイン →
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8">
          {/* サイドナビ */}
          <nav className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-24">
              <ScrollArea className="h-[calc(100vh-120px)]">
                <div className="pr-4">
                  {Object.entries(groupedNavItems).map(([category, items]) => (
                    <div key={category} className="mb-4">
                      <div className="text-xs font-semibold text-gray-400 uppercase mb-2 px-3">
                        {category}
                      </div>
                      {items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => scrollToSection(item.id)}
                          className={`block w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                            activeSection === item.id
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </nav>

          {/* メインコンテンツ */}
          <main className="flex-1 min-w-0">
            {/* ====== ボタン ====== */}
            {/* Sentry エラー送信テスト用 */}
            <Section
              id="sentry"
              title="Sentry エラー送信テスト"
              description="VITE_SENTRY_DSN 設定時に Sentry へエラーが送信されるか確認"
            >
              <ComponentBox>
                <Button
                  variant="destructive"
                  onClick={() => {
                    throw new Error('Sentry動作確認テスト')
                  }}
                >
                  Sentry にテストエラーを送信
                </Button>
              </ComponentBox>
            </Section>

            <Section
              id="buttons"
              title="ボタン"
              description="@/components/ui/button.tsx"
            >
              <SubSection title="バリアント">
                <ComponentBox>
                  <Button variant="default">Default</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                  <Button variant="destructive">Destructive</Button>
                </ComponentBox>
              </SubSection>

              <SubSection title="サイズ">
                <ComponentBox>
                  <Button size="sm">Small</Button>
                  <Button size="default">Default</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon"><Plus className="w-4 h-4" /></Button>
                </ComponentBox>
              </SubSection>

              <SubSection title="アイコン付き">
                <ComponentBox>
                  <Button><Plus className="w-4 h-4 mr-2" />追加</Button>
                  <Button variant="outline"><Search className="w-4 h-4 mr-2" />検索</Button>
                  <Button variant="secondary"><Download className="w-4 h-4 mr-2" />ダウンロード</Button>
                  <Button variant="destructive"><Trash2 className="w-4 h-4 mr-2" />削除</Button>
                </ComponentBox>
              </SubSection>

              <SubSection title="状態">
                <ComponentBox>
                  <Button disabled>Disabled</Button>
                  <Button variant="outline" disabled>Disabled</Button>
                  <Button className="opacity-50 cursor-wait">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...
                  </Button>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== バッジ ====== */}
            <Section
              id="badges"
              title="バッジ"
              description="@/components/ui/badge.tsx"
            >
              <SubSection title="バリアント">
                <ComponentBox>
                  <Badge variant="default">Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="info">Info</Badge>
                  <Badge variant="purple">Purple</Badge>
                  <Badge variant="gray">Gray</Badge>
                  <Badge variant="cancelled">Cancelled</Badge>
                </ComponentBox>
              </SubSection>

              <SubSection title="サイズ">
                <ComponentBox>
                  <Badge size="sm">Small</Badge>
                  <Badge size="md">Medium</Badge>
                  <Badge size="lg">Large</Badge>
                </ComponentBox>
              </SubSection>

              <SubSection title="使用例">
                <ComponentBox>
                  <Badge variant="success">公開中</Badge>
                  <Badge variant="warning">要確認</Badge>
                  <Badge variant="info">NEW</Badge>
                  <Badge variant="gray">下書き</Badge>
                  <Badge variant="destructive">緊急</Badge>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== 入力フォーム ====== */}
            <Section
              id="inputs"
              title="入力フォーム"
              description="@/components/ui/input.tsx, textarea.tsx, checkbox.tsx, switch.tsx, radio-group.tsx"
            >
              <SubSection title="テキスト入力">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ComponentBox label="Input">
                    <div className="w-full space-y-2">
                      <Label htmlFor="demo-input">ラベル</Label>
                      <Input id="demo-input" placeholder="プレースホルダー" />
                    </div>
                  </ComponentBox>
                  <ComponentBox label="Input（disabled）">
                    <div className="w-full space-y-2">
                      <Label>無効状態</Label>
                      <Input placeholder="入力できません" disabled />
                    </div>
                  </ComponentBox>
                </div>
              </SubSection>

              <SubSection title="テキストエリア">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ComponentBox label="Textarea">
                    <div className="w-full space-y-2">
                      <Label>説明</Label>
                      <Textarea placeholder="複数行のテキストを入力..." />
                    </div>
                  </ComponentBox>
                  <ComponentBox label="Textarea（disabled）">
                    <div className="w-full space-y-2">
                      <Label>無効状態</Label>
                      <Textarea placeholder="入力できません" disabled />
                    </div>
                  </ComponentBox>
                </div>
              </SubSection>

              <SubSection title="チェックボックス & スイッチ">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ComponentBox label="Checkbox">
                    <div className="flex items-center gap-3">
                      <Checkbox id="check1" />
                      <Label htmlFor="check1">利用規約に同意する</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox id="check2" checked disabled />
                      <Label htmlFor="check2">チェック済み（disabled）</Label>
                    </div>
                  </ComponentBox>
                  <ComponentBox label="Switch">
                    <div className="flex items-center gap-3">
                      <Switch id="switch1" />
                      <Label htmlFor="switch1">通知を有効にする</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch id="switch2" checked disabled />
                      <Label htmlFor="switch2">有効（disabled）</Label>
                    </div>
                  </ComponentBox>
                </div>
              </SubSection>

              <SubSection title="ラジオグループ">
                <ComponentBox label="RadioGroup">
                  <RadioGroup defaultValue="option1" className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="option1" id="r1" />
                      <Label htmlFor="r1">オプション1</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="option2" id="r2" />
                      <Label htmlFor="r2">オプション2</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="option3" id="r3" />
                      <Label htmlFor="r3">オプション3</Label>
                    </div>
                  </RadioGroup>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== 選択・ドロップダウン ====== */}
            <Section
              id="selects"
              title="選択・ドロップダウン"
              description="@/components/ui/select.tsx"
            >
              <SubSection title="基本">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ComponentBox label="Select">
                    <div className="w-full space-y-2">
                      <Label>カテゴリ</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="選択してください" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">オプション1</SelectItem>
                          <SelectItem value="2">オプション2</SelectItem>
                          <SelectItem value="3">オプション3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </ComponentBox>
                  <ComponentBox label="Select（disabled）">
                    <div className="w-full space-y-2">
                      <Label>無効状態</Label>
                      <Select disabled>
                        <SelectTrigger>
                          <SelectValue placeholder="選択できません" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">オプション1</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </ComponentBox>
                </div>
              </SubSection>
            </Section>

            {/* ====== カード ====== */}
            <Section
              id="cards"
              title="カード"
              description="@/components/ui/card.tsx"
            >
              <SubSection title="基本スタイル">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>カードタイトル</CardTitle>
                      <CardDescription>カードの説明文がここに入ります</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600">カードの内容がここに入ります。</p>
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" size="sm">詳細</Button>
                    </CardFooter>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        予約情報
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">日時</span>
                          <span>2024/01/15 14:00</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">人数</span>
                          <span>6名</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-primary">
                    <CardHeader className="pb-2">
                      <Badge variant="info" className="w-fit">おすすめ</Badge>
                      <CardTitle className="text-lg">ハイライトカード</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600">ボーダーカラーで強調</p>
                    </CardContent>
                  </Card>
                </div>
              </SubSection>
            </Section>

            {/* ====== タブ ====== */}
            <Section
              id="tabs"
              title="タブ"
              description="@/components/ui/tabs.tsx"
            >
              <SubSection title="基本スタイル">
                <ComponentBox>
                  <Tabs defaultValue="tab1" className="w-full">
                    <TabsList>
                      <TabsTrigger value="tab1">タブ1</TabsTrigger>
                      <TabsTrigger value="tab2">タブ2</TabsTrigger>
                      <TabsTrigger value="tab3">タブ3</TabsTrigger>
                    </TabsList>
                    <TabsContent value="tab1" className="mt-4">
                      <p className="text-sm text-gray-600">タブ1の内容がここに表示されます。</p>
                    </TabsContent>
                    <TabsContent value="tab2" className="mt-4">
                      <p className="text-sm text-gray-600">タブ2の内容がここに表示されます。</p>
                    </TabsContent>
                    <TabsContent value="tab3" className="mt-4">
                      <p className="text-sm text-gray-600">タブ3の内容がここに表示されます。</p>
                    </TabsContent>
                  </Tabs>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== ダイアログ ====== */}
            <Section
              id="dialogs"
              title="ダイアログ"
              description="@/components/ui/dialog.tsx"
            >
              <SubSection title="サイズバリエーション">
                <ComponentBox>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">Small ダイアログ</Button>
                    </DialogTrigger>
                    <DialogContent size="sm">
                      <DialogHeader>
                        <DialogTitle>確認</DialogTitle>
                        <DialogDescription>この操作を実行しますか？</DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline">キャンセル</Button>
                        <Button>実行</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">Medium ダイアログ</Button>
                    </DialogTrigger>
                    <DialogContent size="md">
                      <DialogHeader>
                        <DialogTitle>設定の編集</DialogTitle>
                        <DialogDescription>以下の設定を変更できます。</DialogDescription>
                      </DialogHeader>
                      <div className="py-4 space-y-4">
                        <div className="space-y-2">
                          <Label>名前</Label>
                          <Input placeholder="入力してください" />
                        </div>
                        <div className="space-y-2">
                          <Label>説明</Label>
                          <Textarea placeholder="説明を入力..." />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline">キャンセル</Button>
                        <Button>保存</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">Large ダイアログ</Button>
                    </DialogTrigger>
                    <DialogContent size="lg">
                      <DialogHeader>
                        <DialogTitle>詳細情報</DialogTitle>
                        <DialogDescription>大きなコンテンツを表示するためのダイアログ</DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <div className="h-48 bg-gray-100 rounded flex items-center justify-center text-gray-400">
                          Large Content Area
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline">閉じる</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== シート ====== */}
            <Section
              id="sheets"
              title="シート（サイドパネル）"
              description="@/components/ui/sheet.tsx"
            >
              <SubSection title="方向バリエーション">
                <ComponentBox>
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline">右から開く</Button>
                    </SheetTrigger>
                    <SheetContent side="right">
                      <SheetHeader>
                        <SheetTitle>シートタイトル</SheetTitle>
                        <SheetDescription>サイドからスライドインするパネルです。</SheetDescription>
                      </SheetHeader>
                      <div className="py-4">
                        <p className="text-sm text-gray-600">コンテンツがここに入ります。</p>
                      </div>
                      <SheetFooter>
                        <SheetClose asChild>
                          <Button variant="outline">閉じる</Button>
                        </SheetClose>
                        <Button>保存</Button>
                      </SheetFooter>
                    </SheetContent>
                  </Sheet>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline">左から開く</Button>
                    </SheetTrigger>
                    <SheetContent side="left">
                      <SheetHeader>
                        <SheetTitle>メニュー</SheetTitle>
                        <SheetDescription>ナビゲーションメニューの例</SheetDescription>
                      </SheetHeader>
                      <div className="py-4 space-y-2">
                        <Button variant="ghost" className="w-full justify-start"><Home className="w-4 h-4 mr-2" />ホーム</Button>
                        <Button variant="ghost" className="w-full justify-start"><BookOpen className="w-4 h-4 mr-2" />シナリオ</Button>
                        <Button variant="ghost" className="w-full justify-start"><Users className="w-4 h-4 mr-2" />スタッフ</Button>
                        <Button variant="ghost" className="w-full justify-start"><Settings className="w-4 h-4 mr-2" />設定</Button>
                      </div>
                    </SheetContent>
                  </Sheet>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline">下から開く</Button>
                    </SheetTrigger>
                    <SheetContent side="bottom">
                      <SheetHeader>
                        <SheetTitle>アクション選択</SheetTitle>
                        <SheetDescription>操作を選択してください</SheetDescription>
                      </SheetHeader>
                      <div className="py-4 flex gap-4 justify-center">
                        <Button><Plus className="w-4 h-4 mr-2" />追加</Button>
                        <Button variant="outline"><Edit className="w-4 h-4 mr-2" />編集</Button>
                        <Button variant="destructive"><Trash2 className="w-4 h-4 mr-2" />削除</Button>
                      </div>
                    </SheetContent>
                  </Sheet>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== ポップオーバー ====== */}
            <Section
              id="popovers"
              title="ポップオーバー"
              description="@/components/ui/popover.tsx"
            >
              <SubSection title="基本">
                <ComponentBox>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">ポップオーバーを開く</Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">ポップオーバー</h4>
                        <p className="text-sm text-gray-500">追加の情報やフォームを表示できます。</p>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">フォーム付き</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-4">
                        <h4 className="font-medium">設定</h4>
                        <div className="space-y-2">
                          <Label htmlFor="popover-input">名前</Label>
                          <Input id="popover-input" placeholder="入力..." />
                        </div>
                        <Button size="sm" className="w-full">保存</Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== アラート ====== */}
            <Section
              id="alerts"
              title="アラート"
              description="@/components/ui/alert.tsx"
            >
              <SubSection title="バリアント">
                <div className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>お知らせ</AlertTitle>
                    <AlertDescription>
                      これは通常のアラートメッセージです。
                    </AlertDescription>
                  </Alert>

                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>エラー</AlertTitle>
                    <AlertDescription>
                      これはエラーアラートメッセージです。問題が発生しました。
                    </AlertDescription>
                  </Alert>
                </div>
              </SubSection>
            </Section>

            {/* ====== ツールチップ ====== */}
            <Section
              id="tooltips"
              title="ツールチップ"
              description="@/components/ui/tooltip.tsx"
            >
              <SubSection title="基本">
                <ComponentBox>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline">ホバーしてください</Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>ツールチップの内容です</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon">
                        <Info className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>詳細情報を表示</p>
                    </TooltipContent>
                  </Tooltip>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== テーブル ====== */}
            <Section
              id="tables"
              title="テーブル"
              description="@/components/ui/table.tsx"
            >
              <SubSection title="基本テーブル">
                <ComponentBox>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">ID</TableHead>
                        <TableHead>名前</TableHead>
                        <TableHead>ステータス</TableHead>
                        <TableHead className="text-right">金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">#001</TableCell>
                        <TableCell>山田太郎</TableCell>
                        <TableCell><Badge variant="success">完了</Badge></TableCell>
                        <TableCell className="text-right">¥5,000</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">#002</TableCell>
                        <TableCell>鈴木花子</TableCell>
                        <TableCell><Badge variant="warning">処理中</Badge></TableCell>
                        <TableCell className="text-right">¥3,500</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">#003</TableCell>
                        <TableCell>田中一郎</TableCell>
                        <TableCell><Badge variant="gray">保留</Badge></TableCell>
                        <TableCell className="text-right">¥7,200</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== ステータス表示 ====== */}
            <Section
              id="status"
              title="ステータス表示"
              description="@/components/ui/status-badge.tsx"
            >
              <SubSection title="StatusBadge">
                <ComponentBox>
                  <StatusBadge status="active" usageCount={5} />
                  <StatusBadge status="active" label="使用中" />
                  <StatusBadge status="ready" startDate="2024-02-01" />
                  <StatusBadge status="legacy" usageCount={2} />
                  <StatusBadge status="unused" />
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== ヒーローセクション ====== */}
            <Section
              id="hero"
              title="ヒーローセクション"
              description="@/pages/PlatformTop/, @/pages/PublicBookingTop/"
            >
              <SubSection title="プラットフォームトップ（シャープデザイン）">
                <div className="border overflow-hidden" style={{ borderRadius: 0 }}>
                  <div 
                    className="relative overflow-hidden text-white p-8"
                    style={{ backgroundColor: THEME.primary }}
                  >
                    {/* アクセント装飾 */}
                    <div 
                      className="absolute top-0 right-0 w-48 h-48 opacity-20"
                      style={{ 
                        background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
                        transform: 'translate(30%, -30%)'
                      }}
                    />
                    <div 
                      className="absolute bottom-0 left-0 w-1 h-12"
                      style={{ backgroundColor: THEME.accent }}
                    />
                    
                    <div className="relative text-center">
                      <div 
                        className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium mb-4"
                        style={{ backgroundColor: THEME.accent, color: '#000' }}
                      >
                        <Sparkles className="w-3 h-3" />
                        MMQ
                      </div>
                      
                      <h1 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
                        マーダーミステリーを探そう
                      </h1>
                      <p className="text-sm opacity-90 mb-6">
                        様々な店舗のマーダーミステリーを検索・予約
                      </p>

                      <div className="flex gap-3 justify-center">
                        <Button
                          className="bg-white hover:bg-gray-100 px-6 h-12 font-semibold"
                          style={{ color: THEME.primary, borderRadius: 0 }}
                        >
                          <Search className="w-4 h-4 mr-2" />
                          シナリオを探す
                        </Button>
                        <Button
                          variant="ghost"
                          className="border-2 border-white/50 text-white hover:bg-white/10 hover:text-white px-6 h-12"
                          style={{ borderRadius: 0 }}
                        >
                          マイページ
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-100 p-4 text-center text-sm text-gray-500">
                    PlatformTop ヒーロー (@/pages/PlatformTop/index.tsx)
                  </div>
                </div>
              </SubSection>

              <SubSection title="組織別予約サイト（MMQレッド統一）">
                <div className="border overflow-hidden" style={{ borderRadius: 0 }}>
                  <div 
                    className="relative overflow-hidden text-white p-4"
                    style={{ backgroundColor: THEME.primary }}
                  >
                    {/* アクセント装飾 */}
                    <div 
                      className="absolute top-0 right-0 w-24 h-24 opacity-20"
                      style={{ 
                        background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
                        transform: 'translate(30%, -30%)'
                      }}
                    />
                    <div 
                      className="absolute bottom-0 left-0 w-1 h-8"
                      style={{ backgroundColor: THEME.accent }}
                    />
                    
                    <div className="relative">
                      <div 
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium mb-2"
                        style={{ backgroundColor: THEME.accent, color: '#000' }}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        MMQ
                      </div>
                      <h1 className="text-base font-medium mb-0.5">MMQ</h1>
                      <p className="text-sm text-white/80">
                        リアルな謎解き体験。あなたは事件の真相を暴けるか？
                      </p>
                    </div>
                  </div>
                  <div className="bg-gray-100 p-4 text-center text-sm text-gray-500">
                    PublicBookingTop ヒーロー (@/pages/PublicBookingTop/index.tsx)
                  </div>
                </div>
              </SubSection>
            </Section>

            {/* ====== シナリオカード ====== */}
            <Section
              id="scenario-card"
              title="シナリオカード"
              description="@/pages/PublicBookingTop/components/ScenarioCard.tsx, @/pages/PlatformTop/"
            >
              <SubSection title="シャープデザイン（PlatformTop）">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div 
                    className="bg-white border border-gray-200 overflow-hidden hover:shadow-lg transition-all cursor-pointer"
                    style={{ borderRadius: 0 }}
                  >
                    {/* キービジュアル */}
                    <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-gray-400" />
                      </div>
                      {/* お気に入りボタン */}
                      <button 
                        className="absolute top-2 right-2 w-8 h-8 bg-white/90 flex items-center justify-center text-gray-400 hover:text-red-500"
                        style={{ borderRadius: 0 }}
                      >
                        <Heart className="w-4 h-4" />
                      </button>
                      {/* 人気タグ */}
                      <div 
                        className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-black"
                        style={{ backgroundColor: THEME.accent }}
                      >
                        人気
                      </div>
                    </div>
                    {/* コンテンツ */}
                    <div className="p-3">
                      <h3 className="text-sm font-bold text-gray-900 mb-2 line-clamp-2">
                        消えた令嬢と銀の時計塔
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />6人
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />3h
                        </span>
                      </div>
                      {/* 次回公演 */}
                      <div className="border-t border-gray-100 pt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="w-1 h-4 flex-shrink-0"
                              style={{ backgroundColor: THEME.primary }}
                            />
                            <span className="font-medium text-gray-900">
                              1/15<span className="ml-0.5 font-normal text-gray-400">(水)</span>
                            </span>
                            <span className="text-gray-400">MMQ新宿</span>
                          </div>
                          <span 
                            className="text-[10px] font-bold px-1.5 py-0.5"
                            style={{
                              backgroundColor: THEME.accentLight,
                              color: THEME.accent,
                              borderRadius: 0,
                            }}
                          >
                            残3
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div 
                    className="bg-white border border-gray-200 overflow-hidden hover:shadow-lg transition-all cursor-pointer"
                    style={{ borderRadius: 0 }}
                  >
                    <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-300 to-gray-400 overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-gray-500" />
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-bold text-gray-900 mb-2 line-clamp-2">
                        黒薔薇館の殺人
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />7人
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />4h
                        </span>
                      </div>
                      <div className="border-t border-gray-100 pt-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1 h-4 flex-shrink-0 bg-blue-500" />
                            <span className="font-medium text-gray-900">
                              1/18<span className="ml-0.5 font-normal text-blue-500">(土)</span>
                            </span>
                            <span className="text-gray-400">MMQ渋谷</span>
                          </div>
                          <span 
                            className="text-[10px] font-bold px-1.5 py-0.5"
                            style={{
                              backgroundColor: '#FEE2E2',
                              color: '#DC2626',
                              borderRadius: 0,
                            }}
                          >
                            残1
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </SubSection>

              <SubSection title="通常デザイン（PublicBookingTop）">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Card className="overflow-hidden border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <div className="relative w-full aspect-[1/1.4] bg-gray-200 overflow-hidden flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-gray-400" />
                      <button className="absolute top-2 right-2 text-gray-400 hover:text-green-500">
                        <Heart className="h-5 w-5" />
                      </button>
                    </div>
                    <CardContent className="p-3 space-y-1 bg-white">
                      <p className="text-xs text-gray-500">作者名</p>
                      <h3 className="text-sm truncate">消えた令嬢と銀の時計塔</h3>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="flex items-center gap-0.5">
                          <Users className="h-3 w-3" />6人
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />180分
                        </span>
                        <span>¥4,500〜</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="secondary" className="text-xs px-1.5 py-0.5 h-5 font-normal bg-gray-100 border-0 rounded-[2px]">
                          推理
                        </Badge>
                        <Badge variant="secondary" className="text-xs px-1.5 py-0.5 h-5 font-normal bg-gray-100 border-0 rounded-[2px]">
                          ファンタジー
                        </Badge>
                      </div>
                      <div className="space-y-0.5 mt-1">
                        <div className="flex items-center gap-1.5 text-xs py-1 px-2 bg-gray-100 rounded-[3px]">
                          <span className="text-gray-800">
                            1/15<span className="ml-0.5 text-gray-600">(水)</span>
                            <span className="font-normal text-gray-600 ml-0.5">14:00</span>
                          </span>
                          <span className="text-xs text-primary">新宿</span>
                          <span className="text-xs text-gray-600 ml-auto">残3席</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </SubSection>
            </Section>

            {/* ====== 店舗カード ====== */}
            <Section
              id="store-card"
              title="店舗カード"
              description="@/pages/PlatformTop/"
            >
              <SubSection title="参加店舗">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    className="bg-gray-50 p-4 hover:shadow-md transition-all cursor-pointer border border-gray-100 hover:scale-[1.02]"
                    style={{ borderRadius: 0 }}
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-14 h-14 flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
                      >
                        <Building2 className="w-7 h-7" style={{ color: THEME.primary }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">MMQ新宿店</h3>
                        <p className="text-sm text-gray-500">予約サイトを見る →</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300" />
                    </div>
                  </div>

                  <div
                    className="bg-gray-50 p-4 hover:shadow-md transition-all cursor-pointer border border-gray-100 hover:scale-[1.02]"
                    style={{ borderRadius: 0 }}
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-14 h-14 flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
                      >
                        <Building2 className="w-7 h-7" style={{ color: THEME.primary }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">MMQ渋谷店</h3>
                        <p className="text-sm text-gray-500">予約サイトを見る →</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300" />
                    </div>
                  </div>
                </div>
              </SubSection>
            </Section>

            {/* ====== CTA ====== */}
            <Section
              id="cta"
              title="CTAセクション"
              description="@/pages/PlatformTop/"
            >
              <SubSection title="コールトゥアクション">
                <div 
                  className="relative overflow-hidden p-8 text-center text-white"
                  style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
                >
                  {/* アクセント装飾 */}
                  <div 
                    className="absolute top-0 right-0 w-48 h-full"
                    style={{ 
                      background: `linear-gradient(90deg, transparent 0%, ${THEME.accent}30 100%)`,
                    }}
                  />
                  <div 
                    className="absolute bottom-0 left-0 w-24 h-1"
                    style={{ backgroundColor: THEME.accent }}
                  />
                  
                  <div className="relative">
                    <h2 className="text-xl md:text-2xl font-bold mb-3">
                      今すぐシナリオを探そう
                    </h2>
                    <p className="opacity-90 mb-6 text-sm max-w-md mx-auto">
                      様々な店舗のマーダーミステリーを検索。<br />
                      あなたにぴったりの物語を見つけましょう。
                    </p>
                    <Button
                      className="bg-white hover:bg-gray-100 px-6 hover:scale-[1.02] transition-transform"
                      style={{ color: THEME.primary, borderRadius: 0 }}
                    >
                      シナリオを探す
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </SubSection>
            </Section>

            {/* ====== 検索バー ====== */}
            <Section
              id="search"
              title="検索バー"
              description="@/pages/PublicBookingTop/components/SearchBar.tsx"
            >
              <SubSection title="検索・フィルター">
                <ComponentBox>
                  <div className="w-full max-w-xl flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="シナリオを検索..."
                        className="pl-9 pr-3 text-sm h-10"
                      />
                    </div>
                    <Button variant="outline" className="h-10 px-3 flex items-center gap-1.5 whitespace-nowrap text-sm">
                      <BookOpen className="w-4 h-4" />
                      <span>カタログ</span>
                    </Button>
                  </div>
                </ComponentBox>

                <div className="mt-4">
                  <ComponentBox label="地域フィルター（PlatformTop）">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-gray-500" />
                      <Select defaultValue="all">
                        <SelectTrigger className="w-32" style={{ borderRadius: 0 }}>
                          <SelectValue placeholder="地域" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全国</SelectItem>
                          <SelectItem value="tokyo">東京都</SelectItem>
                          <SelectItem value="kanagawa">神奈川県</SelectItem>
                          <SelectItem value="osaka">大阪府</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </ComponentBox>
                </div>
              </SubSection>
            </Section>

            {/* ====== レイアウト ====== */}
            <Section
              id="layout"
              title="レイアウトコンポーネント"
              description="@/components/layout/"
            >
              <SubSection title="ヘッダー">
                <div className="border rounded-lg overflow-hidden">
                  <div className="border-b border-border bg-card h-12 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">MMQ</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-accent">
                        <Building2 className="h-3 w-3 text-primary" />
                        <span className="text-sm font-medium">組織名</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">ユーザー名</span>
                      <Badge className="bg-blue-100 text-blue-800">管理者</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <User className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Bell className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <LogOut className="h-4 w-4 mr-1" />
                        ログアウト
                      </Button>
                    </div>
                  </div>
                  <div className="bg-gray-100 p-4 text-center text-sm text-gray-500">
                    Header コンポーネント (@/components/layout/Header.tsx)
                  </div>
                </div>
              </SubSection>

              <SubSection title="ページヘッダー">
                <div className="border rounded-lg overflow-hidden">
                  <div className="p-6 bg-white border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <h1 className="text-2xl font-bold">ページタイトル</h1>
                        <p className="text-sm text-muted-foreground mt-1">ページの説明文がここに入ります</p>
                      </div>
                      <Button><Plus className="w-4 h-4 mr-2" />新規作成</Button>
                    </div>
                  </div>
                  <div className="bg-gray-100 p-4 text-center text-sm text-gray-500">
                    PageHeader コンポーネント (@/components/layout/PageHeader.tsx)
                  </div>
                </div>
              </SubSection>
            </Section>

            {/* ====== ナビゲーション ====== */}
            <Section
              id="navigation"
              title="ナビゲーション"
              description="@/components/layout/NavigationBar.tsx"
            >
              <SubSection title="ナビゲーションバー">
                <div className="border rounded-lg overflow-hidden">
                  <div className="border-b border-border bg-muted/30 px-4 py-2">
                    <div className="flex items-center gap-1">
                      {[
                        { icon: LayoutDashboard, label: 'ダッシュボード', active: true },
                        { icon: Calendar, label: 'スケジュール', active: false },
                        { icon: Users, label: 'スタッフ', active: false },
                        { icon: BookOpen, label: 'シナリオ', active: false },
                        { icon: Settings, label: '設定', active: false },
                      ].map(item => (
                        <div
                          key={item.label}
                          className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded ${
                            item.active 
                              ? 'text-foreground border-b-2 border-primary bg-accent/50' 
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-100 p-4 text-center text-sm text-gray-500">
                    NavigationBar コンポーネント (@/components/layout/NavigationBar.tsx)
                  </div>
                </div>
              </SubSection>
            </Section>

            {/* ====== ローディング ====== */}
            <Section
              id="loading"
              title="ローディング"
              description="@/components/layout/LoadingScreen.tsx"
            >
              <SubSection title="ローディング画面">
                <div className="border rounded-lg overflow-hidden">
                  <div className="h-48 flex items-center justify-center bg-background">
                    <div className="text-center space-y-4">
                      <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                      <p className="text-muted-foreground">読み込み中...</p>
                    </div>
                  </div>
                  <div className="bg-gray-100 p-4 text-center text-sm text-gray-500">
                    LoadingScreen コンポーネント (@/components/layout/LoadingScreen.tsx)
                  </div>
                </div>
              </SubSection>

              <SubSection title="インラインローディング">
                <ComponentBox>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    データを読み込んでいます...
                  </div>
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== アイコン ====== */}
            <Section
              id="icons"
              title="アイコン"
              description="lucide-react からインポート"
            >
              <SubSection title="よく使うアイコン">
                <ComponentBox>
                  <div className="grid grid-cols-8 gap-4">
                    {[
                      { icon: Search, name: 'Search' },
                      { icon: Plus, name: 'Plus' },
                      { icon: Edit, name: 'Edit' },
                      { icon: Trash2, name: 'Trash2' },
                      { icon: Calendar, name: 'Calendar' },
                      { icon: Clock, name: 'Clock' },
                      { icon: Users, name: 'Users' },
                      { icon: Building2, name: 'Building2' },
                      { icon: Star, name: 'Star' },
                      { icon: Heart, name: 'Heart' },
                      { icon: Settings, name: 'Settings' },
                      { icon: Copy, name: 'Copy' },
                      { icon: ExternalLink, name: 'ExternalLink' },
                      { icon: Download, name: 'Download' },
                      { icon: Upload, name: 'Upload' },
                      { icon: RefreshCw, name: 'RefreshCw' },
                      { icon: X, name: 'X' },
                      { icon: Menu, name: 'Menu' },
                      { icon: ArrowRight, name: 'ArrowRight' },
                      { icon: Check, name: 'Check' },
                      { icon: ChevronDown, name: 'ChevronDown' },
                      { icon: Info, name: 'Info' },
                      { icon: AlertCircle, name: 'AlertCircle' },
                      { icon: Bell, name: 'Bell' },
                      { icon: User, name: 'User' },
                      { icon: LogOut, name: 'LogOut' },
                      { icon: Home, name: 'Home' },
                      { icon: BookOpen, name: 'BookOpen' },
                      { icon: LayoutDashboard, name: 'LayoutDashboard' },
                      { icon: Shield, name: 'Shield' },
                      { icon: FileCheck, name: 'FileCheck' },
                      { icon: HelpCircle, name: 'HelpCircle' },
                    ].map(({ icon: Icon, name }) => (
                      <Tooltip key={name}>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 p-2 hover:bg-gray-100 rounded cursor-pointer">
                            <Icon className="w-5 h-5 text-gray-700" />
                            <span className="text-[10px] text-gray-400">{name}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <code className="text-xs">{`<${name} />`}</code>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </ComponentBox>
              </SubSection>
            </Section>

            {/* ====== カラーパレット ====== */}
            <Section
              id="colors"
              title="カラーパレット"
              description="src/index.css で定義されたCSS変数"
            >
              <SubSection title="システムカラー">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { name: 'background', var: 'hsl(var(--background))', label: '背景色' },
                    { name: 'foreground', var: 'hsl(var(--foreground))', label: '文字色' },
                    { name: 'primary', var: 'hsl(var(--primary))', label: 'プライマリ' },
                    { name: 'primary-foreground', var: 'hsl(var(--primary-foreground))', label: 'プライマリ文字' },
                    { name: 'secondary', var: 'hsl(var(--secondary))', label: 'セカンダリ' },
                    { name: 'muted', var: 'hsl(var(--muted))', label: 'Muted' },
                    { name: 'muted-foreground', var: 'hsl(var(--muted-foreground))', label: 'Muted文字' },
                    { name: 'accent', var: 'hsl(var(--accent))', label: 'アクセント' },
                    { name: 'destructive', var: 'hsl(var(--destructive))', label: 'Destructive' },
                    { name: 'border', var: 'hsl(var(--border))', label: 'ボーダー' },
                    { name: 'input', var: 'hsl(var(--input))', label: '入力' },
                    { name: 'card', var: 'hsl(var(--card))', label: 'カード' },
                  ].map(color => (
                    <div key={color.name} className="space-y-1">
                      <div 
                        className="h-12 rounded border"
                        style={{ backgroundColor: color.var }}
                      />
                      <div className="text-xs">
                        <div className="font-medium">{color.label}</div>
                        <div className="text-gray-400 font-mono">--{color.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="入力背景色">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div 
                      className="h-12 rounded border flex items-center justify-center text-sm text-gray-600"
                      style={{ backgroundColor: 'var(--input-bg)' }}
                    >
                      入力エリア背景色
                    </div>
                    <div className="text-xs">
                      <div className="font-medium">Input Background</div>
                      <div className="text-gray-400 font-mono">--input-bg: #F6F9FB</div>
                    </div>
                  </div>
                </div>
              </SubSection>
            </Section>

            {/* ====== テーマ ====== */}
            <Section
              id="theme"
              title="テーマ設定"
              description="@/lib/theme.ts - MYPAGE_THEME, BOOKING_THEME"
            >
              <SubSection title="マイページテーマ (MYPAGE_THEME)">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { name: 'primary', value: THEME.primary, label: 'メインカラー（MMQレッド）' },
                    { name: 'primaryHover', value: THEME.primaryHover, label: 'ホバー時' },
                    { name: 'primaryLight', value: THEME.primaryLight, label: 'ライト' },
                    { name: 'accent', value: THEME.accent, label: 'アクセント（エメラルド）' },
                    { name: 'accentLight', value: THEME.accentLight, label: 'アクセントライト' },
                    { name: 'background', value: THEME.background, label: '背景色' },
                    { name: 'cardBg', value: THEME.cardBg, label: 'カード背景' },
                    { name: 'border', value: THEME.border, label: 'ボーダー' },
                  ].map(color => (
                    <div key={color.name} className="space-y-1">
                      <div 
                        className="h-12 border flex items-center justify-center"
                        style={{ backgroundColor: color.value, borderRadius: 0 }}
                      />
                      <div className="text-xs">
                        <div className="font-medium">{color.label}</div>
                        <div className="text-gray-400 font-mono">{color.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="テーマプリセット">
                <ComponentBox>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                    {[
                      { name: 'MMQ Red', primary: '#E60012', accent: '#10B981' },
                      { name: 'Forest Green', primary: '#16a34a', accent: '#22c55e' },
                      { name: 'Ocean Blue', primary: '#2563eb', accent: '#3b82f6' },
                      { name: 'Royal Purple', primary: '#7c3aed', accent: '#8b5cf6' },
                    ].map(preset => (
                      <div key={preset.name} className="text-center">
                        <div className="flex gap-1 mb-2 justify-center">
                          <div 
                            className="w-10 h-10 border"
                            style={{ backgroundColor: preset.primary, borderRadius: 0 }}
                          />
                          <div 
                            className="w-10 h-10 border"
                            style={{ backgroundColor: preset.accent, borderRadius: 0 }}
                          />
                        </div>
                        <div className="text-xs text-gray-600">{preset.name}</div>
                      </div>
                    ))}
                  </div>
                </ComponentBox>
                <div className="mt-4 p-4 bg-gray-50 border rounded text-sm text-gray-600">
                  <p className="font-medium mb-2">テーマを変更するには:</p>
                  <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">src/lib/theme.ts</code> の <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">MYPAGE_THEME</code> を編集してください。
                </div>
              </SubSection>

              <SubSection title="予約サイトテーマ (BOOKING_THEME) - MMQレッド統一">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { name: 'primary', value: BOOKING_THEME.primary, label: 'プライマリ（MMQレッド）' },
                    { name: 'primaryLight', value: BOOKING_THEME.primaryLight, label: 'プライマリライト' },
                    { name: 'accent', value: BOOKING_THEME.accent, label: 'アクセント（エメラルド）' },
                    { name: 'accentLight', value: BOOKING_THEME.accentLight, label: 'アクセントライト' },
                  ].map(color => (
                    <div key={color.name} className="space-y-1">
                      <div 
                        className="h-12 border flex items-center justify-center"
                        style={{ backgroundColor: color.value, borderRadius: 0 }}
                      />
                      <div className="text-xs">
                        <div className="font-medium">{color.label}</div>
                        <div className="text-gray-400 font-mono">{color.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <ComponentBox label="ヒーロープレビュー（シャープデザイン）">
                    <div 
                      className="w-full text-center text-white relative overflow-hidden"
                      style={{ backgroundColor: BOOKING_THEME.primary, padding: '24px' }}
                    >
                      {/* アクセント装飾 */}
                      <div 
                        className="absolute top-0 right-0 w-24 h-24 opacity-20"
                        style={{ 
                          background: `radial-gradient(circle at center, ${BOOKING_THEME.accent} 0%, transparent 70%)`,
                          transform: 'translate(30%, -30%)'
                        }}
                      />
                      <h2 className="text-lg font-bold mb-1 relative">予約サイトヒーロー</h2>
                      <p className="text-sm text-white/80 relative">
                        PublicBookingTop, ScenarioDetailPage で使用
                      </p>
                    </div>
                  </ComponentBox>
                </div>
                <div className="mt-4 p-4 bg-red-50 border border-red-200 text-sm text-gray-600" style={{ borderRadius: 0 }}>
                  <p className="font-medium mb-2">予約サイトのテーマを変更するには:</p>
                  <code className="bg-gray-100 px-2 py-0.5 font-mono text-xs" style={{ borderRadius: 0 }}>src/lib/theme.ts</code> の <code className="bg-gray-100 px-2 py-0.5 font-mono text-xs" style={{ borderRadius: 0 }}>BOOKING_THEME</code> を編集してください。
                </div>
              </SubSection>
            </Section>

            {/* ====== タイポグラフィ ====== */}
            <Section
              id="typography"
              title="タイポグラフィ"
              description="フォントサイズ・スタイル"
            >
              <SubSection title="見出し">
                <div className="space-y-4 p-4 bg-white border rounded-lg">
                  <h1 className="text-4xl font-bold">Heading 1 - 見出し1</h1>
                  <h2 className="text-3xl font-bold">Heading 2 - 見出し2</h2>
                  <h3 className="text-2xl font-bold">Heading 3 - 見出し3</h3>
                  <h4 className="text-xl font-semibold">Heading 4 - 見出し4</h4>
                  <h5 className="text-lg font-semibold">Heading 5 - 見出し5</h5>
                  <h6 className="text-base font-medium">Heading 6 - 見出し6</h6>
                </div>
              </SubSection>

              <SubSection title="本文テキスト">
                <div className="space-y-3 p-4 bg-white border rounded-lg">
                  <p className="text-base">通常テキスト (text-base / 16px)</p>
                  <p className="text-sm">小さいテキスト (text-sm / 14px)</p>
                  <p className="text-xs">極小テキスト (text-xs / 12px)</p>
                  <p className="text-sm text-muted-foreground">Muted テキスト</p>
                  <p className="text-sm font-medium">Medium ウェイト</p>
                  <p className="text-sm font-semibold">Semibold ウェイト</p>
                  <p className="text-sm font-bold">Bold ウェイト</p>
                </div>
              </SubSection>
            </Section>

            {/* フッター */}
            <div className="mt-16 py-8 border-t text-center text-sm text-gray-400">
              <p>UIコンポーネントを調整するには、<code className="bg-gray-100 px-2 py-0.5 rounded">src/components/ui/</code> 内のファイルを編集してください。</p>
              <p className="mt-2">変更は全ての使用箇所に自動的に反映されます。</p>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default ComponentGallery
