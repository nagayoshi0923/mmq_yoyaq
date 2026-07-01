import type { Dispatch, SetStateAction, FormEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, AlertCircle, Eye, EyeOff, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Link } from 'react-router-dom'

// 都道府県リスト
const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
]

interface ProfileFormProps {
  userEmail: string
  handleSubmit: (e: FormEvent) => void
  name: string
  setName: Dispatch<SetStateAction<string>>
  nickname: string
  setNickname: Dispatch<SetStateAction<string>>
  phone: string
  setPhone: Dispatch<SetStateAction<string>>
  prefecture: string
  setPrefecture: Dispatch<SetStateAction<string>>
  birthDate: string
  setBirthDate: Dispatch<SetStateAction<string>>
  isOAuthUser: boolean
  showPassword: boolean
  setShowPassword: Dispatch<SetStateAction<boolean>>
  password: string
  setPassword: Dispatch<SetStateAction<string>>
  confirmPassword: string
  setConfirmPassword: Dispatch<SetStateAction<string>>
  acceptTerms: boolean
  setAcceptTerms: Dispatch<SetStateAction<boolean>>
  acceptNewsletter: boolean
  setAcceptNewsletter: Dispatch<SetStateAction<boolean>>
  error: string
  isLoading: boolean
}

export function ProfileForm({
  userEmail, handleSubmit, name, setName, nickname, setNickname, phone, setPhone,
  prefecture, setPrefecture, birthDate, setBirthDate, isOAuthUser, showPassword, setShowPassword,
  password, setPassword, confirmPassword, setConfirmPassword, acceptTerms, setAcceptTerms,
  acceptNewsletter, setAcceptNewsletter, error, isLoading,
}: ProfileFormProps) {
  return (
    <div 
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#FAFAFA' }}
    >
      {/* ヘッダー */}
      <header className="py-4 px-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span 
              className="text-xl font-bold"
              style={{ color: THEME.primary }}
            >
              MMQ
            </span>
          </Link>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Card className="border border-gray-200 shadow-lg">
            <CardHeader className="text-center px-6 pt-8 pb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <UserPlus className="w-6 h-6" style={{ color: THEME.primary }} />
                <CardTitle className="text-xl">アカウント設定</CardTitle>
              </div>
              <CardDescription>
                あと少しで登録完了です！<br />
                以下の情報を入力してください。
              </CardDescription>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-2">
                  メール: <span className="font-medium">{userEmail}</span>
                </p>
              )}
            </CardHeader>
            
            <CardContent className="px-6 pb-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* お名前 */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                    お名前 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="山田 太郎"
                    className="h-12"
                    disabled={isLoading}
                  />
                </div>

                {/* ニックネーム */}
                <div>
                  <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1.5">
                    ニックネーム
                    <span className="text-xs text-gray-500 ml-2">（公演中に呼ばれる名前）</span>
                  </label>
                  <Input
                    id="nickname"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    autoComplete="nickname"
                    placeholder="タロウ"
                    className="h-12"
                    disabled={isLoading}
                  />
                </div>

                {/* 電話番号 */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
                    電話番号 <span className="text-red-500">*</span>
                    <span className="text-xs text-gray-500 ml-2">（当日連絡用）</span>
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    autoComplete="tel"
                    placeholder="090-1234-5678"
                    className="h-12"
                    disabled={isLoading}
                  />
                </div>

                {/* 都道府県 */}
                <div>
                  <label htmlFor="prefecture" className="block text-sm font-medium text-gray-700 mb-1.5">
                    お住まいの都道府県 <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="prefecture"
                    value={prefecture}
                    onChange={(e) => setPrefecture(e.target.value)}
                    required
                    className="w-full h-12 px-3 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#E60012] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={isLoading}
                  >
                    <option value="">選択してください</option>
                    {PREFECTURES.map((pref) => (
                      <option key={pref} value={pref}>{pref}</option>
                    ))}
                  </select>
                </div>

                {/* 生年月日 */}
                <div>
                  <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1.5">
                    生年月日 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="birthDate"
                    type="text"
                    inputMode="numeric"
                    value={birthDate}
                    onChange={(e) => {
                      // 数字とスラッシュのみ許可、自動フォーマット
                      let value = e.target.value.replace(/[^\d/]/g, '')
                      // スラッシュを除去して数字だけにする
                      const digits = value.replace(/\//g, '')
                      // 自動でスラッシュを挿入 (YYYY/MM/DD)
                      if (digits.length <= 4) {
                        value = digits
                      } else if (digits.length <= 6) {
                        value = `${digits.slice(0, 4)}/${digits.slice(4)}`
                      } else {
                        value = `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`
                      }
                      setBirthDate(value)
                    }}
                    placeholder="1990/01/15"
                    maxLength={10}
                    className="h-12"
                    disabled={isLoading}
                  />
                </div>

                {/* パスワード（メールサインアップのみ） */}
                {!isOAuthUser && (
                  <>
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                        パスワード <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          placeholder="6文字以上"
                          className="pr-10 h-12"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        6文字以上で入力してください
                      </p>
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                        パスワード（確認） <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="もう一度入力"
                        className="h-12"
                        disabled={isLoading}
                      />
                      {confirmPassword && password === confirmPassword && (
                        <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          パスワードが一致しています
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* 利用規約同意（必須） */}
                <div className="flex items-start gap-3 pt-2">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 accent-[#E60012] cursor-pointer"
                    disabled={isLoading}
                  />
                  <label htmlFor="terms" className="text-sm text-gray-600 cursor-pointer select-none">
                    <Link to="/terms" className="underline text-blue-600 hover:text-blue-800" target="_blank">利用規約</Link>
                    および
                    <Link to="/privacy" className="underline text-blue-600 hover:text-blue-800" target="_blank">プライバシーポリシー</Link>
                    に同意する <span className="text-red-500">*</span>
                  </label>
                </div>

                {/* メールマガジン同意 */}
                <div className="flex items-start gap-3">
                  <input
                    id="newsletter"
                    type="checkbox"
                    checked={acceptNewsletter}
                    onChange={(e) => setAcceptNewsletter(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 accent-[#E60012] cursor-pointer"
                    disabled={isLoading}
                  />
                  <label htmlFor="newsletter" className="text-sm text-gray-600 cursor-pointer select-none">
                    新作シナリオやキャンペーンなどのお知らせメールを受け取る
                  </label>
                </div>

                {/* エラー表示 */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* 送信ボタン */}
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold"
                  style={{ backgroundColor: THEME.primary }}
                  disabled={isLoading}
                >
                  {isLoading ? '登録中...' : '登録を完了する'}
                </Button>
              </form>


              {/* ログアウトリンク */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={async () => {
                    // scope:'local' でローカルセッションだけクリア（OAuth refresh token の revoke で
                    // ハングする/エラーを投げるケースがあり、その場合に遷移しなくなるのを避ける）。
                    try {
                      await supabase.auth.signOut({ scope: 'local' })
                    } catch (err) {
                      logger.warn('signOut error (continuing anyway):', err)
                    }
                    window.location.href = '/'
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  ログアウトしてトップページに戻る
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
