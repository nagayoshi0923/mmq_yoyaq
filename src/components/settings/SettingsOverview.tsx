import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { SETTINGS_PAGES, SETTINGS_SCOPES, settingsPath, type SettingsScope } from './settingsCatalog'

export function SettingsOverview({ slug, isPlatformAdmin, scope, storeId }: { slug: string; isPlatformAdmin: boolean; scope?: SettingsScope; storeId?: string }) {
  return (
    <div className="space-y-6">
      <p>変更したい対象から設定を選んでください。店舗と作品は組織に属し、公演で組み合わされます。</p>
      <nav aria-label="設定の範囲" className="flex flex-wrap gap-2">
        <Link className="border rounded-md px-3 py-2" aria-current={!scope ? 'page' : undefined} to={settingsPath(slug)}>すべて</Link>
        {SETTINGS_SCOPES.map(item => <Link key={item.id} className="border rounded-md px-3 py-2" aria-current={scope === item.id ? 'page' : undefined} to={`${settingsPath(slug)}&scope=${item.id}`}>{item.label}</Link>)}
      </nav>
      <div className="grid gap-4 lg:grid-cols-2">
        {SETTINGS_SCOPES.filter(item => !scope || item.id === scope).map(item => (
          <Card key={item.id}>
            <CardHeader><CardTitle>{item.label}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {item.id === 'store' && <Link className="underline" to={`/${slug}/stores`}>店舗情報・設備・費用を編集</Link>}
              {SETTINGS_PAGES.filter(page => page.scope === item.id && !page.legacy).map(page => (
                <div key={page.id} className="space-y-1">
                  <Link className="underline underline-offset-4" to={settingsPath(slug, page.id, page.scope === 'store' ? storeId : undefined)}>{page.label}</Link>
                  <p className="text-muted-foreground">{page.description}</p>
                </div>
              ))}
              {item.id === 'store' && <details><summary className="cursor-pointer">その他の既存設定</summary><div className="space-y-3 pt-3">{SETTINGS_PAGES.filter(page => page.legacy).map(page => <div key={page.id}><Link className="underline" to={settingsPath(slug, page.id, storeId)}>{page.label}</Link><p className="text-muted-foreground">{page.effect}</p></div>)}</div></details>}
              {item.id === 'scenario' && <>
                <p>共通の作品情報をもとに、自社の料金・GM・公演可能店舗・貸切条件を設定します。</p>
                <p>作品編集の「共通情報と自社設定」で設定元を確認できます。募集基準は組織共通の参照か作品独自の指定を選びます。</p>
                <div className="flex flex-wrap gap-4"><Link className="underline" to={`/${slug}/scenarios`}>作品を選んで編集</Link><Link className="underline" to={settingsPath(slug, 'recruitment')}>共通の募集基準</Link></div>
              </>}
              {item.id === 'performance' && <>
                <p>スケジュールから公演を選び、日時・店舗・GM・募集と受付締切・個別案内を編集します。</p>
                <p>予約確定・貸切確定メールは、公演 → 作品 → 店舗 → 標準文面の順で使用します。受付締切と、開催判断の期限・キャンセル期限は別の設定です。</p>
                <p>料金・条件を変更する場合は、予約済みの内容を確認してください。共通設定の保存で過去の予約を一括更新する機能ではありません。</p>
                <Link className="underline" to={`/${slug}/schedule`}>公演を選んで編集</Link>
              </>}
            </CardContent>
          </Card>
        ))}
      </div>
      {isPlatformAdmin && !scope && <Card><CardHeader><CardTitle>MMQ全体の管理</CardTitle><CardDescription>権限のある管理者向け。組織共通設定とは別の管理です。</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-4"><Link className="underline" to={`/${slug}/organizations`}>組織管理</Link><Link className="underline" to="/admin/scenario-masters">共通の作品マスタ</Link></CardContent></Card>}
    </div>
  )
}
