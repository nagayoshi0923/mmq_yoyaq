# セットアップガイド

**最終更新**: 2025-12-30

外部連携機能のセットアップドキュメント。

---

## フォルダ構成

| フォルダ | 機能 | まず読むファイル |
|---------|------|----------------|
| `email/` | メール送信（Resend） | `email-setup.md` |
| `discord/` | Discord通知 | `discord-bot-setup.md` |
| `google-sheets/` | Google Sheets連携 | `google-sheets-sync-setup.md` |
| `supabase/` | Supabase設定 | 各ファイルを参照 |

---

## 各機能の概要

### メール通知 (`email/`)

**目的**: 予約確認・リマインダー・招待メールの送信

**必要なもの**:
- Resend アカウント
- 独自ドメイン（推奨）

**主要ファイル**:
- `email-setup.md` - セットアップ全体の流れ
- `resend-quick-setup.md` - クイックセットアップ（5分）
- `email-usage-scenarios.md` - どんな場面でメールが送られるか

### Discord通知 (`discord/`)

**目的**: スタッフへの貸切リクエスト通知・シフト提出依頼

**必要なもの**:
- Discord Bot
- Discordサーバー管理権限

**主要ファイル**:
- `discord-bot-setup.md` - Botの作成とセットアップ
- `discord-channel-setup.md` - チャンネルIDの設定
- `discord-shift-notification.md` - シフト通知の設定
- `discord-troubleshooting.md` - トラブルシューティング

### Google Sheets連携 (`google-sheets/`)

**目的**: シフトデータをスプレッドシートに同期

**必要なもの**:
- Google アカウント
- Google Apps Script

**主要ファイル**:
- `google-sheets-sync-setup.md` - 同期セットアップ
- `google-apps-script-setup.md` - Apps Scriptの設定
- `sheets-sync-architecture.md` - アーキテクチャ説明

### Supabase設定 (`supabase/`)

**目的**: バックエンド関連の設定

**主要ファイル**:
- `supabase-storage-setup.md` - 画像ストレージの設定
- `supabase-api-token-setup.md` - APIトークンの設定
- `edge-functions-deploy.md` - Edge Functionsのデプロイ
- `user-management-setup.md` - ユーザー管理の設定

---

## セットアップの優先順位

新規環境を構築する場合の推奨順序：

1. **Supabase** - データベースと認証の基盤
2. **メール** - 予約確認に必須
3. **Discord** - スタッフ通知（任意だが推奨）
4. **Google Sheets** - シフト管理（任意）

---

## 関連ドキュメント

- [system-overview.md](../system-overview.md) - システム全体像
- [features.md](../features.md) - 機能詳細
