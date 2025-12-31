# 機能詳細ドキュメント

**最終更新**: 2025-12-30

各機能の技術詳細ドキュメント。機能の概要は [features.md](../features.md) を参照。

---

## 📁 フォルダ構造

```
features/
├── README.md                    # このファイル
│
├── schedule-manager/            # スケジュール管理
├── reservation/                 # 予約機能
├── private-booking/             # 貸切予約
├── notifications/               # 通知機能（Discord・メール）
├── shift-management/            # シフト管理
├── staff-management/            # スタッフ管理
├── scenario-management/         # シナリオ管理
├── sales-management/            # 売上管理
├── license-management/          # ライセンス管理
├── author-portal/               # 作者ポータル
├── customer-management/         # 顧客管理
├── salary-calculation/          # 給与計算
├── store-organization/          # 店舗・組織管理
└── auth-system/                 # 認証・権限システム
```

---

## 📖 機能一覧

### コア機能

| フォルダ | 機能 | 重要度 |
|---------|------|-------|
| [schedule-manager/](./schedule-manager/) | 公演スケジュール管理・🚨重複チェック | 🔴 高 |
| [reservation/](./reservation/) | 通常予約フロー | 🔴 高 |
| [private-booking/](./private-booking/) | 貸切予約・GM確認・🚨競合チェック | 🔴 高 |

### 運営機能

| フォルダ | 機能 | 重要度 |
|---------|------|-------|
| [shift-management/](./shift-management/) | シフト提出・締切管理 | 🟡 中 |
| [staff-management/](./staff-management/) | スタッフ登録・招待・役割 | 🟡 中 |
| [scenario-management/](./scenario-management/) | シナリオ情報・料金設定 | 🟡 中 |
| [customer-management/](./customer-management/) | 顧客情報管理 | 🟢 低 |

### 財務機能

| フォルダ | 機能 | 重要度 |
|---------|------|-------|
| [sales-management/](./sales-management/) | 売上集計・分析 | 🟡 中 |
| [salary-calculation/](./salary-calculation/) | GM給与計算 | 🟡 中 |
| [license-management/](./license-management/) | ライセンス料管理 | 🟡 中 |
| [author-portal/](./author-portal/) | 作者向けポータル | 🟢 低 |

### 基盤機能

| フォルダ | 機能 | 重要度 |
|---------|------|-------|
| [notifications/](./notifications/) | Discord・メール通知 | 🟡 中 |
| [store-organization/](./store-organization/) | 店舗・組織・マルチテナント | 🔴 高 |
| [auth-system/](./auth-system/) | 認証・権限システム | 🔴 高 |

---

## 📝 各ドキュメントの構成

全てのREADMEは以下の構成:

1. **概要** - 機能の目的と解決する課題
2. **画面構成** - ASCII図による視覚的説明
3. **処理フロー** - フローチャート形式
4. **データ構造** - TypeScript型定義
5. **関連ファイル** - ページ・コンポーネント・フック一覧
6. **🚨注意点** - CRITICAL機能・重要なロジック
7. **トラブルシューティング** - よくある問題と対処法
8. **関連ドキュメント** - 他ドキュメントへのリンク

---

## 🔍 読み方

### 新規開発者

1. [../features.md](../features.md) で全体像を把握
2. [auth-system/](./auth-system/) で認証の仕組みを理解
3. [store-organization/](./store-organization/) でマルチテナント構造を理解
4. 担当機能のフォルダを詳しく読む

### 特定機能を修正する場合

1. 該当フォルダを読む
2. 「🚨注意点」を必ず確認
3. [../development/critical-features.md](../development/critical-features.md) で重要機能でないか確認

---

## ⚠️ ドキュメント更新ルール

コード変更時は関連ドキュメントも同じコミットで更新。

詳細: `rules/rurle.mdc` の「13) ドキュメント信頼性ルール」
