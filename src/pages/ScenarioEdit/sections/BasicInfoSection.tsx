import { useRef, useState, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Upload, X } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { useScenariosQuery } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { storeApi } from '@/lib/api'
import type { Store } from '@/types'

interface BasicInfoSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function BasicInfoSection({ formData, setFormData }: BasicInfoSectionProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [isAddAuthorDialogOpen, setIsAddAuthorDialogOpen] = useState(false)
  const [newAuthorName, setNewAuthorName] = useState('')
  const [stores, setStores] = useState<Store[]>([])
  
  // 店舗データを取得
  useEffect(() => {
    const loadStores = async () => {
      try {
        const storesData = await storeApi.getAll()
        setStores(storesData)
      } catch (error) {
        logger.error('店舗データの取得エラー:', error)
      }
    }
    loadStores()
  }, [])
  
  // 店舗選択オプション
  const storeOptions = useMemo(() => {
    return stores.map(store => ({
      id: store.id,
      name: store.name
    }))
  }, [stores])
  
  // 既存のシナリオから作者リストを取得
  const { data: scenarios = [] } = useScenariosQuery()
  
  // 作者 → メアドのマッピングを作成
  const authorEmailMap = useMemo(() => {
    const map = new Map<string, string>()
    scenarios.forEach(scenario => {
      if (scenario.author && scenario.author_email && !map.has(scenario.author)) {
        map.set(scenario.author, scenario.author_email)
      }
    })
    return map
  }, [scenarios])
  
  const authorOptions = useMemo(() => {
    const authors = new Set<string>()
    scenarios.forEach(scenario => {
      if (scenario.author) {
        authors.add(scenario.author)
      }
    })
    // 現在選択されている作者も含める
    if (formData.author && !authors.has(formData.author)) {
      authors.add(formData.author)
    }
    return Array.from(authors).sort().map(author => ({ id: author, name: author }))
  }, [scenarios, formData.author])

  // 作者選択時にメアドを自動入力
  const handleAuthorChange = (authorName: string) => {
    setFormData(prev => {
      const existingEmail = authorEmailMap.get(authorName)
      return {
        ...prev,
        author: authorName,
        // メアドが未入力で、既存のメアドがある場合は自動入力
        author_email: prev.author_email || existingEmail || ''
      }
    })
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file, 5)
    if (!validation.valid) {
      showToast.error(validation.error)
      return
    }

    setUploading(true)
    try {
      const result = await uploadImage(file, 'key-visuals')
      if (result) {
        setFormData(prev => ({ ...prev, key_visual_url: result.url }))
      } else {
        showToast.error('画像のアップロードに失敗しました')
      }
    } catch (error) {
      logger.error('画像アップロードエラー:', error)
      showToast.error('画像のアップロードに失敗しました')
    } finally {
      setUploading(false)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    }
  }

  const handleImageRemove = () => {
    if (confirm('画像を削除しますか？')) {
      setFormData(prev => ({ ...prev, key_visual_url: '' }))
    }
  }

  const handleAddAuthor = () => {
    if (!newAuthorName.trim()) {
      showToast.warning('作者名を入力してください')
      return
    }

    // 作者を設定（単一選択なので配列ではなく文字列）
    setFormData(prev => ({
      ...prev,
      author: newAuthorName.trim()
    }))

    setNewAuthorName('')
    setIsAddAuthorDialogOpen(false)
  }

  return (
    <div>
      <h3 className="text-lg mb-4 pb-2 border-b">基本情報</h3>
      <div className="space-y-4">
          {/* キービジュアル + タイトル・作者 */}
          <div className="flex gap-6">
            {/* キービジュアル */}
            <div className="w-[150px] shrink-0">
              {formData.key_visual_url ? (
                <div className="relative group">
                  <OptimizedImage
                    src={formData.key_visual_url}
                    alt="Key Visual"
                    className="w-full aspect-square object-contain rounded bg-muted/30"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleImageRemove}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="w-full aspect-square border-2 border-dashed rounded flex items-center justify-center bg-muted/30">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                    className="h-full w-full"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* タイトル・作者・カテゴリ */}
            <div className="flex-1 flex flex-col justify-center space-y-4">
              <div>
                <Label htmlFor="title" className="text-sm">タイトル *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="author" className="text-sm">作者 *</Label>
                <MultiSelect
                  options={authorOptions}
                  selectedValues={formData.author ? [formData.author] : []}
                  onSelectionChange={(values) => {
                    // 単一選択なので、最初の値を設定し、メアドを自動入力
                    handleAuthorChange(values[0] || '')
                  }}
                  placeholder="作者を選択"
                  showBadges={true}
                  className="mt-1.5"
                  emptyText="作者が見つかりません"
                  emptyActionLabel="+ 作者を追加"
                  onEmptyAction={() => setIsAddAuthorDialogOpen(true)}
                  closeOnSelect={true}
                />
              </div>
              <div>
                <Label htmlFor="author_email" className="text-sm">作者メールアドレス</Label>
                <Input
                  id="author_email"
                  type="email"
                  value={formData.author_email || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, author_email: e.target.value }))}
                  placeholder="author@example.com"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  公演報告を作者に通知するためのメールアドレス
                  {formData.author && authorEmailMap.has(formData.author) && (
                    <span className="text-green-600 ml-1">
                      （既存のメアドから自動入力）
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

              <div>
                <Label htmlFor="description">説明</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={6}
                  placeholder="シナリオの詳細な説明を入力してください"
                />
              </div>

              <div>
                <Label htmlFor="scenario_type">シナリオタイプ</Label>
                <Select
                  value={formData.scenario_type || 'normal'}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, scenario_type: value as 'normal' | 'managed' }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">通常シナリオ</SelectItem>
                    <SelectItem value="managed">管理シナリオ</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  管理シナリオは自分の団体がライセンス料を管理するシナリオです
                </p>
              </div>

              <div>
                <Label htmlFor="available_stores">公演可能店舗</Label>
                <StoreMultiSelect
                  stores={stores}
                  selectedStoreIds={formData.available_stores || []}
                  onStoreIdsChange={(storeIds) => {
                    setFormData(prev => ({ ...prev, available_stores: storeIds }))
                  }}
                  label=""
                  hideLabel={true}
                  placeholder="全店舗で公演可能"
                  emptyText="未選択=全店舗で公演可能"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  このシナリオを公演可能な店舗を選択してください。未選択の場合は全店舗で公演可能です。
                </p>
              </div>
      </div>

      {/* 作者追加ダイアログ */}
      <Dialog open={isAddAuthorDialogOpen} onOpenChange={setIsAddAuthorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しい作者を追加</DialogTitle>
            <DialogDescription>
              新しい作者名を入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="newAuthorName">作者名</Label>
              <Input
                id="newAuthorName"
                value={newAuthorName}
                onChange={(e) => setNewAuthorName(e.target.value)}
                placeholder="例: 山田太郎"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddAuthor()
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNewAuthorName('')
              setIsAddAuthorDialogOpen(false)
            }}>
              キャンセル
            </Button>
            <Button onClick={handleAddAuthor}>
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

