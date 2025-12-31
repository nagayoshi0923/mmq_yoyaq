# 過去の貸切予約にschedule_event_idを紐付ける

過去に承認された貸切予約で、`schedule_event_id`が未紐付けのものがある場合、これを修正するためのスクリプトです。

## 問題

貸切予約承認時に`schedule_event_id`を紐付ける処理を追加しましたが、過去に承認された貸切予約には紐付けがされていない場合があります。

これにより：
- 公演編集ダイアログの「予約者」タブに予約者が表示されない
- リマインドメールが送信されない

## 解決方法

### 方法1: SQLスクリプトで実行（推奨）

1. Supabase Dashboard を開く
2. SQL Editor に移動
3. `link_private_booking_schedule_events.sql` を開く
4. **ステップ1**を実行して未紐付けの予約を確認
5. **ステップ2**を実行してマッチングを確認
6. **ステップ3**のコメントアウトを外して実行（UPDATE文）
7. **ステップ4**で結果を確認

### 方法2: TypeScriptスクリプトで実行

```bash
# 環境変数を設定
export SUPABASE_URL="your_supabase_url"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# スクリプトを実行
deno run --allow-net --allow-env --allow-read scripts/link_private_booking_reservations.ts
```

## マッチングロジック

以下の条件で予約と`schedule_events`をマッチングします：

1. **日時一致**: `candidate_datetimes.candidates`で`status = 'confirmed'`の候補の日時と、`schedule_events`の日時が一致
2. **店舗一致**: `reservations.store_id`または`candidate_datetimes.confirmedStore.storeId`と、`schedule_events.store_id`が一致
3. **シナリオ一致**: `reservations.scenario_title`または`title`と、`schedule_events.scenario`が一致

## 注意事項

- 実行前に必ず**ステップ1**と**ステップ2**で確認してください
- 複数の`schedule_events`にマッチする場合は、作成日時が最も古いものが選択されます
- マッチする`schedule_events`が見つからない場合は、手動で確認が必要です

## トラブルシューティング

### マッチしない予約がある場合

1. `candidate_datetimes`に`status = 'confirmed'`の候補があるか確認
2. `schedule_events`に同じ日時・店舗の公演が存在するか確認
3. `schedule_events.venue`（テキスト）と`stores.name`が一致しているか確認

### エラーが発生した場合

- `schedule_events`が作成されていない可能性があります
- 手動で`schedule_events`を作成するか、承認処理を再実行してください

