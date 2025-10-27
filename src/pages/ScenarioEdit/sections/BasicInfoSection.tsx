import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Upload, X } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { useState } from 'react'

interface BasicInfoSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function BasicInfoSection({ formData, setFormData }: BasicInfoSectionProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

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

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b">基本情報</h3>
      <div className="space-y-4">
          {/* キービジュアル + タイトル・作者 */}
          <div className="flex gap-4">
            {/* キービジュアル */}
            <div className="w-[100px] shrink-0">
              {formData.key_visual_url ? (
                <div className="relative group">
                  <OptimizedImage
                    src={formData.key_visual_url}
                    alt="Key Visual"
                    className="w-full aspect-[16/9] object-cover rounded"
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
                <div className="w-full aspect-[16/9] border-2 border-dashed rounded flex items-center justify-center bg-muted/30">
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

            {/* タイトル・作者 */}
            <div className="flex-1 space-y-3">
              <div>
                <Label htmlFor="title">タイトル *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="author">作者 *</Label>
                <Input
                  id="author"
                  value={formData.author}
                  onChange={(e) => setFormData(prev => ({ ...prev, author: e.target.value }))}
                  required
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
    </div>
  )
}

