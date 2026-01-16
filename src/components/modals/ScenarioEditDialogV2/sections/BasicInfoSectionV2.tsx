import { useRef, useState, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Upload, X, Trash2, Wand2 } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { generateSlugFromTitle } from '@/utils/toRomaji'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { useScenariosQuery } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { storeApi } from '@/lib/api'
import type { Store } from '@/types'

// 統一スタイル
const labelStyle = "text-sm font-medium mb-1 block"
const hintStyle = "text-xs text-muted-foreground mt-1"
const inputStyle = "h-10 text-sm"

interface BasicInfoSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
  scenarioId?: string | null
  onDelete?: () => void
}

export function BasicInfoSectionV2({ formData, setFormData, scenarioId, onDelete }: BasicInfoSectionV2Props) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [isAddAuthorDialogOpen, setIsAddAuthorDialogOpen] = useState(false)
  const [newAuthorName, setNewAuthorName] = useState('')
  const [stores, setStores] = useState<Store[]>([])
  
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
  
  const storeOptions = useMemo(() => {
    return stores.map(store => ({ id: store.id, name: store.name }))
  }, [stores])
  
  const { data: scenarios = [] } = useScenariosQuery()
  
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
      if (scenario.author) authors.add(scenario.author)
    })
    if (formData.author && !authors.has(formData.author)) {
      authors.add(formData.author)
    }
    return Array.from(authors).sort().map(author => ({ id: author, name: author }))
  }, [scenarios, formData.author])

  const handleAuthorChange = (authorName: string) => {
    setFormData(prev => {
      const existingEmail = authorEmailMap.get(authorName)
      return {
        ...prev,
        author: authorName,
        author_email: prev.author_email || existingEmail || ''
      }
    })
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file, 5)
    if (!validation.valid) {
      showToast.error(validation.error || 'ファイルバリデーションエラー')
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
      if (imageInputRef.current) imageInputRef.current.value = ''
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
    setFormData(prev => ({ ...prev, author: newAuthorName.trim() }))
    setNewAuthorName('')
    setIsAddAuthorDialogOpen(false)
  }

  return (
    <div className="space-y-4">
      {/* メイン情報カード */}
      <Card>
        <CardContent className="p-5">
          <div className="flex gap-5">
            {/* キービジュアル */}
            <div className="w-28 shrink-0">
              <Label className={labelStyle}>画像</Label>
              {formData.key_visual_url ? (
                <div className="relative group">
                  <OptimizedImage
                    src={formData.key_visual_url}
                    alt="Key Visual"
                    className="w-full aspect-[3/4] object-cover rounded border"
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
                <div 
                  className="w-full aspect-[3/4] border-2 border-dashed rounded flex items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* タイトル・作者・メール */}
            <div className="flex-1 space-y-3">
              {/* 管理作品トグル */}
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="flex items-center gap-3">
                  <Switch
                    id="scenario_type"
                    checked={formData.scenario_type === 'managed'}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      scenario_type: checked ? 'managed' : 'normal' 
                    }))}
                  />
                  <Label htmlFor="scenario_type" className="text-sm font-medium cursor-pointer">
                    管理作品
                  </Label>
                </div>
                {formData.scenario_type === 'managed' && (
                  <Badge className="bg-blue-100 text-blue-800">ライセンス管理</Badge>
                )}
              </div>
              
              {/* タイトル・Slug（横並び） */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={labelStyle}>タイトル *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="シナリオの正式名称"
                    className={inputStyle}
                  />
                </div>
                <div>
                  <Label className={labelStyle}>Slug（URL用）</Label>
                  <div className="flex gap-2">
                    <Input
                      id="slug"
                      value={formData.slug || ''}
                      onChange={(e) => {
                        // 小文字、英数字、ハイフンのみ許可
                        const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                        setFormData(prev => ({ ...prev, slug: value }))
                      }}
                      placeholder="aiu-kairo（英数字とハイフン）"
                      className={`${inputStyle} flex-1`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 px-3"
                      onClick={() => {
                        if (formData.title) {
                          const generatedSlug = generateSlugFromTitle(formData.title)
                          setFormData(prev => ({ ...prev, slug: generatedSlug }))
                          showToast.success('タイトルからslugを生成しました')
                        } else {
                          showToast.error('タイトルを先に入力してください')
                        }
                      }}
                      title="タイトルから自動生成"
                    >
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* 作者・メール（横並び） */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={labelStyle}>作者 *</Label>
                  <MultiSelect
                    options={authorOptions}
                    selectedValues={formData.author ? [formData.author] : []}
                    onSelectionChange={(values) => handleAuthorChange(values[0] || '')}
                    placeholder="選択または新規追加"
                    showBadges={true}
                    emptyText="作者が見つかりません"
                    emptyActionLabel="+ 作者を追加"
                    onEmptyAction={() => setIsAddAuthorDialogOpen(true)}
                    closeOnSelect={true}
                  />
                </div>
                <div>
                  <Label className={labelStyle}>
                    メールアドレス
                    {formData.author && authorEmailMap.has(formData.author) && (
                      <span className="text-green-600 ml-1 font-normal text-xs">✓ 自動</span>
                    )}
                  </Label>
                  <Input
                    id="author_email"
                    type="email"
                    value={formData.author_email || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, author_email: e.target.value }))}
                    placeholder="公演報告の送信先"
                    className={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 説明 */}
      <Card>
        <CardContent className="p-5">
          <Label className={labelStyle}>説明・あらすじ</Label>
          <p className={hintStyle}>予約サイトでお客様に表示される説明文。世界観やストーリーの概要を記載します</p>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={4}
            placeholder="シナリオの詳細な説明を入力してください"
            className="text-sm mt-1.5"
          />
        </CardContent>
      </Card>

      {/* 設定 */}
      <Card>
        <CardContent className="p-5 space-y-4">
          {/* キット数・店舗設定 */}
          <div className="flex items-end gap-4">
            <div className="w-32">
              <Label className={labelStyle}>キット数</Label>
              <Select
                value={String(formData.kit_count || 1)}
                onValueChange={(value) => {
                  const kitCount = parseInt(value)
                  setFormData(prev => {
                    // 既存のproduction_costsを更新（キットの金額を変更）
                    let newCosts = [...prev.production_costs]
                    const kitIndex = newCosts.findIndex(c => c.item === 'キット')
                    
                    if (kitCount === 0) {
                      // キット0個の場合は削除
                      newCosts = newCosts.filter(c => c.item !== 'キット')
                    } else if (kitIndex >= 0) {
                      newCosts[kitIndex] = { ...newCosts[kitIndex], amount: kitCount * 30000 }
                    } else {
                      // キットがなければ追加
                      newCosts = [
                        { item: 'キット', amount: kitCount * 30000 },
                        ...newCosts
                      ]
                    }
                    // マニュアルがなければ追加
                    if (!newCosts.find(c => c.item === 'マニュアル')) {
                      newCosts.push({ item: 'マニュアル', amount: 10000 })
                    }
                    // スライドがなければ追加
                    if (!newCosts.find(c => c.item === 'スライド')) {
                      newCosts.push({ item: 'スライド', amount: 10000 })
                    }
                    return {
                      ...prev,
                      kit_count: kitCount,
                      production_costs: newCosts
                    }
                  })
                }}
              >
                <SelectTrigger className={inputStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* 下段：公演可能店舗 */}
          <div>
            <Label className={labelStyle}>公演可能店舗</Label>
            <StoreMultiSelect
              stores={stores}
              selectedStoreIds={formData.available_stores || []}
              onStoreIdsChange={(storeIds) => {
                setFormData(prev => ({ ...prev, available_stores: storeIds }))
              }}
              hideLabel={true}
              placeholder="全店舗で公演可能"
              emptyText="未選択=全店舗で公演可能"
            />
          </div>
        </CardContent>
      </Card>

      {/* 作者追加ダイアログ */}
      <Dialog open={isAddAuthorDialogOpen} onOpenChange={setIsAddAuthorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しい作者を追加</DialogTitle>
            <DialogDescription>新しい作者名を入力してください</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="newAuthorName">作者名</Label>
              <Input
                id="newAuthorName"
                value={newAuthorName}
                onChange={(e) => setNewAuthorName(e.target.value)}
                placeholder="例: 山田太郎"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddAuthor() }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewAuthorName(''); setIsAddAuthorDialogOpen(false) }}>
              キャンセル
            </Button>
            <Button onClick={handleAddAuthor}>追加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除ボタン（既存シナリオの場合のみ表示） */}
      {scenarioId && onDelete && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-destructive">シナリオを削除</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  この操作は取り消せません。関連する公演データは残ります。
                </p>
              </div>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                削除
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

