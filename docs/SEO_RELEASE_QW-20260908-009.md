# QW-20260908-009 SEO改修（プレビュー検証済み・本番統合待ち）

2026-09-08。利用者の「最後までがんばって」に基づく実装。公開URLは https://mmq.game 。

## 変更

- 公開トップ・店舗・作品・静的ページで、通常アクセスとbotに同じ本文入りHTMLとReactアプリを配信。
- 作品ごとのtitle・description・canonical、公開作品リンク、人数・所要時間を初期HTMLへ。組織別ページの通常料金は既存公開価格関数を利用。
- 組織別作品取得はorganization_idで限定。不存在404、DB障害503/no-store。既存認証・管理入口と静的ページを維持。
- Vercelはindex.htmlをrewriteより優先するため、配備ビルドだけapp.htmlへ移し、ルートもSEO関数へ到達させる。ハッシュ付きJS/CSSは同一ビルドのものを同梱。
- .vercelignoreの*.txtからpublic/robots.txtを除外。サイトマップは取得失敗を部分的な成功にせず503とし、実店舗のない組織を除外。
- UTM・クリック識別子をcanonicalから除外。
- 既存GA4を利用。MMQ G-QSE4VBLEVF、クインズワルツ導線 G-1JLE1C4K9W。公開ページのみpage_view、通常予約の保存成功後のみreservation_complete。予約番号・顧客情報・クエリ・招待トークンを計測へ渡さない。ローカル・previewでは計測しない。

## 検証

- npm run verify: 成功（既存lint警告57件、エラー0）。
- npm run test:unit: 38ファイル・309件成功。
- git diff --check: 成功。
- ステージングDBへのGETのみで、公開HTMLの店舗・作品・組織別作品・404・ログイン・robotsをローカル確認。予約・メール・DB更新は実行していない。
- Vercel previewで関数同梱とrewriteを確認。トップ・組織・作品2系統・店舗・ログイン・robots・sitemapは200、不存在作品は404。Reactの作品名・人数・時間・料金と予約導線を実ブラウザ確認。
- GitHub E2E成功。CI org_scopeガードはbaseline163に対して167で失敗するが、origin/mainもHEADも167で本案件の増加は0。ガードは変更していない。

## 既存Google設定の確認

Search Console mmq.gameは登録済み。2026-09-04更新データで登録28・未登録31。未登録には正常な代替URLやリダイレクトも含むため、31件すべてを障害としない。
GA4: Default Account for Firebase / mmq-project-6e47f、property 467599949、stream 9948170371。配備前に受信データなし。拡張計測は本番公開前に管理画面で再確認する。
HP用GA4はcompany accountのqueenswaltz / property 419196851、stream 6445489904。既存HPとQW予約導線に同一タグを使用。

## 公開作業の進捗（2026-09-08）

- 利用者「すすめて」により既存GitHub/Vercelへの公開を承認。MMQ PR #453を作成し、専用Vercel previewの実配備を確認。
- mainとstagingが分岐し、stagingに別案件の差分がある。デプロイスキルの規定に従い、SEO専用ブランチだけをmainへ反映する方針を確認中。本番MMQはまだ変更していない。
- 公式HPはPR #1をsquash merge（90ae83e）し本番公開成功。26URLすべて200・title/canonical各1・noindexなし。Search Consoleでサイトマップ正常処理・26ページ検出を確認。既存GA4でpage_view受信を確認。
- HPの既存GA4拡張計測は実際にはオン。停止操作は自動承認レビューに拒否され、キャンセル済み。両タグの自動拡張計測を停止して手動実装へ統一する承認を確認中。過去データ削除や新規プロパティ作成は行っていない。
- 残り: MMQ本番反映、MMQ sitemap送信、GA4計測設定の整理、reservation_completeのキーイベント設定。顧客予約を作成して計測テストしない。

検索順位やインデックス登録の反映はGoogle側で後日進む。配備完了と順位改善を区別する。
