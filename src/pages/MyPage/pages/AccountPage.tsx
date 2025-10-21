import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Shield, Mail, Calendar as CalendarIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export function AccountPage() {
  const { user } = useAuth()

  const formatDate = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            アカウント情報
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              メールアドレス
            </Label>
            <Input
              id="email"
              value={user?.email || ''}
              readOnly
              className="bg-muted mt-2"
            />
          </div>

          <div>
            <Label htmlFor="role">ロール</Label>
            <div className="mt-2">
              <Badge
                className={
                  user?.role === 'admin'
                    ? 'bg-blue-100 text-blue-800'
                    : user?.role === 'staff'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-purple-100 text-purple-800'
                }
              >
                {user?.role === 'admin'
                  ? '管理者'
                  : user?.role === 'staff'
                  ? 'スタッフ'
                  : '顧客'}
              </Badge>
            </div>
          </div>

          <div>
            <Label htmlFor="created_at" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              登録日
            </Label>
            <Input
              id="created_at"
              value={user?.created_at ? formatDate(user.created_at) : ''}
              readOnly
              className="bg-muted mt-2"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>セキュリティ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">
              パスワードの変更やアカウントの削除は、管理者にお問い合わせください。
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

