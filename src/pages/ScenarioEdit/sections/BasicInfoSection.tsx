import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Upload, X } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { genreOptions } from '@/components/modals/ScenarioEditModal/utils/constants'

interface BasicInfoSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function BasicInfoSection({ formData, setFormData }: BasicInfoSectionProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file, 5)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    setUploading(true)
    try {
      const result = await uploadImage(file, 'key-visuals')
      if (result) {
        setFormData(prev => ({ ...prev, key_visual_url: result.url }))
      } else {
        alert('画像のアップロードに失敗しました')
      }
    } catch (error) {
      logger.error('画像アップロードエラー:', error)
      alert('画像のアップロードに失敗しました')
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

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      alert('カテゴリ名を入力してください')
      return
    }

    // 既に選択されているカテゴリに追加
    const currentGenres = formData.genre || []
    if (!currentGenres.includes(newCategoryName.trim())) {
      setFormData(prev => ({
        ...prev,
        genre: [...currentGenres, newCategoryName.trim()]
      }))
    }

    setNewCategoryName('')
    setIsAddCategoryDialogOpen(false)
  }

  // 選択されたカテゴリのうち、genreOptionsに存在しないものを抽出
  const selectedGenresNotInOptions = (formData.genre || []).filter(
    genre => !genreOptions.some(opt => opt.name === genre)
  )

  // MultiSelect用のオプション（選択済みだがオプションにないものも含める）
  const allGenreOptions = [
    ...genreOptions,
    ...selectedGenresNotInOptions.map(genre => ({ id: genre, name: genre }))
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b">基本情報</h3>
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
                <Label htmlFor="title" className="text-sm font-medium">タイトル *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="author" className="text-sm font-medium">作者 *</Label>
                <Input
                  id="author"
                  value={formData.author}
                  onChange={(e) => setFormData(prev => ({ ...prev, author: e.target.value }))}
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="genre" className="text-sm font-medium">カテゴリ</Label>
                <MultiSelect
                  options={allGenreOptions}
                  selectedValues={formData.genre || []}
                  onSelectionChange={(values) => setFormData(prev => ({ ...prev, genre: values }))}
                  placeholder="カテゴリを選択"
                  showBadges={true}
                  className="mt-1.5"
                  emptyText="カテゴリが見つかりません"
                  emptyActionLabel="+ カテゴリを追加"
                  onEmptyAction={() => setIsAddCategoryDialogOpen(true)}
                />
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
      </div>

      {/* カテゴリ追加ダイアログ */}
      <Dialog open={isAddCategoryDialogOpen} onOpenChange={setIsAddCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しいカテゴリを追加</DialogTitle>
            <DialogDescription>
              新しいカテゴリ名を入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="newCategoryName">カテゴリ名</Label>
              <Input
                id="newCategoryName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="例: アドベンチャー"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddCategory()
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNewCategoryName('')
              setIsAddCategoryDialogOpen(false)
            }}>
              キャンセル
            </Button>
            <Button onClick={handleAddCategory}>
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

