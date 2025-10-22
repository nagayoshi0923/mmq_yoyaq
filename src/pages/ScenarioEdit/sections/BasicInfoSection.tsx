import { useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>キービジュアル</CardTitle>
        </CardHeader>
        <CardContent>
          {formData.key_visual_url ? (
            <div className="relative inline-block">
              <OptimizedImage
                src={formData.key_visual_url}
                alt="Key Visual"
                className="max-w-md rounded"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={handleImageRemove}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'アップロード中...' : '画像をアップロード'}
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                推奨サイズ: 1200x630px、最大5MB
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

