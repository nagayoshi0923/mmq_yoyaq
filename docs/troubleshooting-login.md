# ログインが動かないとき（復旧チェックリスト）

アプリ・Supabase・ブラウザのどこで詰まっているかを切り分けます。

---

## 1. まずユーザー側で試す（1分）

1. **別ブラウザ**または**シークレットウィンドウ**で開く  
2. **サイトデータを削除**（当該サイトのみで可）  
   - Chrome: 設定 → プライバシー → 閲覧履歴データの削除 → `mmq.game` など  
3. **拡張機能**（広告ブロック、プライバシー系）をオフにして再試行  
4. コンソール（F12）に **赤いエラー** や `Invalid Refresh Token` が出ていないか見る  

---

## 2. 本番 URL・Supabase（ダッシュボード）

| 確認場所 | 内容 |
|----------|------|
| **Authentication → URL Configuration** | **Site URL** が実際の本番と一致（例: `https://mmq.game`）。`www` 運用なら `https://www.mmq.game` に統一。 |
| **Redirect URLs** | `https://mmq.game/**` および使っているなら `https://www.mmq.game/**` が許可リストに入っているか。 |
| **API Keys** | フロントの `VITE_SUPABASE_PUBLISHABLE_KEY`（または `VITE_SUPABASE_ANON_KEY`）が**このプロジェクト**のものか。 |
| **Providers → Google** | 有効化済みで Client ID / Secret が正しいか。 |

Google 側の **承認済みリダイレクト URI** は **`https://<project-ref>.supabase.co/auth/v1/callback`**（Supabase のコールバック）のみでよい。`mmq.game` をここに書く必要はない。

---

## 3. よくある症状と意味

| 症状 | 想定原因の例 |
|------|----------------|
| メール未確認と出る | Supabase でメール確認必須。ダッシュボードでユーザーを確認済みにするか、確認メールのリンクを踏む。 |
| ログイン後すぐ落ちる | 古いリフレッシュトークンが残っている → サイトデータ削除・再ログイン。 |
| Google だけ動かない | Redirect URLs / Google の JavaScript 生成元 / `skipBrowserRedirect` 周りの不整合。ネットワークタブで OAuth 開始リクエストの失敗を確認。 |
| ずっと読み込み | `users` テーブルや RLS でロール取得が失敗・タイムアウト。Supabase のログ・ブラウザ Network を確認。 |

---

## 4. 開発者向け：コードを以前の安定版に戻す

**注意:** 他の修正まで巻き戻るので、戻したあと差分を確認してください。

```bash
# 例: ログイン周りのみ特定コミットのファイルに戻す（コミットハッシュは適宜差し替え）
git show a7cc4b20:src/contexts/AuthContext.tsx > /tmp/AuthContext.tsx
# 内容を確認してから上書きするか、git checkout を使う
git checkout a7cc4b20 -- src/contexts/AuthContext.tsx src/components/auth/LoginForm.tsx
```

履歴の見方:

```bash
git log --oneline -20 -- src/contexts/AuthContext.tsx src/components/auth/LoginForm.tsx
```

---

## 5. それでも解決しないとき

- Supabase **Auth ログ**（Dashboard → Logs → Auth）で失敗理由を確認  
- 同じ操作を **ローカル（`npm run dev`）** で再現するかで、本番環境限定か切り分け  

詳細は `docs/setup/oauth-setup.md`（OAuth）や `docs/setup/supabase/fix-password-reset-redirect.md`（リダイレクト系）も参照してください。
