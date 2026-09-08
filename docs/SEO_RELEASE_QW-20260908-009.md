# QW-20260908-009 SEO改修（配備前・未完了）

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
- 公開リリース前にVercelの関数同梱、rewrite、固定URLを実配備で確認する必要がある。

## 既存Google設定の確認

Search Console mmq.gameは登録済み。2026-09-04更新データで登録28・未登録31。未登録には正常な代替URLやリダイレクトも含むため、31件すべてを障害としない。
GA4: Default Account for Firebase / mmq-project-6e47f、property 467599949、stream 9948170371。受信データなし、拡張計測はオフ。
HP用GA4はcompany accountのqueenswaltz / property 419196851、stream 6445489904。既存HPとQW予約導線に同一タグを使用。

## 配備待ち

自動承認レビューがVercel preview配備を拒否した。理由: 外部サービスへのコード・設定のアップロードについて具体的な宛先・payload・承認が確認できない。
拒否後は代替手段によるアップロードを行っていない。GitHub push、staging/main統合、本番配備、Google側のサイトマップ送信・キーイベント設定は未実施。

承認対象: 本案件のコミットのみを既存GitHub nagayoshi0923/mmq_yoyaqとVercel mmq-yoyaqへ送り、preview・stagingで検証後にmainへsquash反映し、mmq.gameの実応答を確認する。DB/Edge更新は不要。無関係なstaging差分は本番に混ぜない。
その後、Search Consoleでsitemap.xml再送信と代表URL検査、既存GA4でreservation_completeのキーイベント設定・実受信確認を行う。計測テストに顧客予約を作成しない。

検索順位やインデックス登録の反映はGoogle側で後日進む。配備完了と順位改善を区別する。
