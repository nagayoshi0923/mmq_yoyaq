# MMQ 画面遷移図

**最終更新**: 2026-01-10

このドキュメントは、MMQシステムの画面遷移とユーザーフローを視覚化したものです。

---

## 目次

1. [全体概要](#1-全体概要)
2. [顧客フロー](#2-顧客フロー)
3. [管理者フロー](#3-管理者フロー)
4. [GMスタッフフロー](#4-gmスタッフフロー)
5. [貸切予約フロー](#5-貸切予約フロー)
6. [認証フロー](#6-認証フロー)
7. [マルチテナントフロー](#7-マルチテナントフロー)

---

## 1. 全体概要

MMQは3種類のユーザータイプに対応した画面構成を持っています。

```mermaid
flowchart TB
    subgraph entry [エントリーポイント]
        URL[/"URL アクセス"/]
    end
    
    subgraph auth [認証判定]
        AuthCheck{ログイン状態}
    end
    
    subgraph customer [顧客向け]
        BookingSite[予約サイト]
        MyPage[マイページ]
    end
    
    subgraph staff [スタッフ向け]
        StaffTools[スタッフツール]
    end
    
    subgraph admin [管理者向け]
        AdminTools[管理ツール]
    end
    
    URL --> AuthCheck
    AuthCheck -->|未ログイン| BookingSite
    AuthCheck -->|customer| BookingSite
    AuthCheck -->|customer| MyPage
    AuthCheck -->|staff| StaffTools
    AuthCheck -->|admin| AdminTools
    AuthCheck -->|admin| StaffTools
```

### URL構造

| パターン | 対象 | 例 |
|---------|------|-----|
| `/{org-slug}` | 予約サイト | `/queens-waltz` |
| `/{org-slug}/scenario/{id}` | シナリオ詳細 | `/queens-waltz/scenario/abc123` |
| `/dashboard` | 管理ツール | `/dashboard` |
| `/mypage` | マイページ | `/mypage/reservations` |

---

## 2. 顧客フロー

### 2.1 通常予約フロー

```mermaid
flowchart LR
    subgraph booking [予約サイト]
        Top[トップページ<br/>シナリオ一覧]
        Calendar[カレンダー表示]
        List[リスト表示]
        Detail[シナリオ詳細]
    end
    
    subgraph reservation [予約プロセス]
        SelectSlot[公演枠選択]
        Form[予約フォーム]
        Confirm[確認画面]
        Complete[予約完了]
    end
    
    subgraph notification [通知]
        Email[確認メール]
        Reminder[リマインダー]
    end
    
    Top --> Calendar
    Top --> List
    Top --> Detail
    Calendar --> SelectSlot
    List --> SelectSlot
    Detail --> SelectSlot
    SelectSlot --> Form
    Form --> Confirm
    Confirm --> Complete
    Complete --> Email
    Email -.->|前日| Reminder
```

### 2.2 マイページフロー

```mermaid
flowchart TB
    subgraph mypage [マイページ]
        MyTop[マイページトップ]
        Reservations[予約履歴]
        Played[プレイ済み]
        Liked[お気に入り]
        Profile[プロフィール]
    end
    
    subgraph actions [操作]
        Cancel[予約キャンセル]
        ChangeCount[人数変更]
        EditProfile[プロフィール編集]
    end
    
    MyTop --> Reservations
    MyTop --> Played
    MyTop --> Liked
    MyTop --> Profile
    Reservations --> Cancel
    Reservations --> ChangeCount
    Profile --> EditProfile
```

### 2.3 画面詳細

| 画面 | パス | 機能 |
|-----|------|------|
| トップページ | `/{slug}` | シナリオ一覧、検索、フィルタ |
| カレンダー | `/{slug}/calendar` | 日付×店舗マトリックス表示 |
| リスト | `/{slug}/list` | 日付順の公演一覧 |
| シナリオ詳細 | `/{slug}/scenario/{id}` | シナリオ情報、予約可能枠一覧 |
| 予約確認 | (モーダル) | 参加者情報入力、確認 |
| マイページ | `/mypage` | 予約履歴、お気に入り管理 |

---

## 3. 管理者フロー

### 3.1 メインナビゲーション

```mermaid
flowchart TB
    subgraph sidebar [サイドバー]
        Dashboard[ダッシュボード]
    end
    
    subgraph schedule [スケジュール]
        ScheduleMgr[スケジュール管理]
        ReservationMgr[予約管理]
        PrivateBooking[貸切管理]
    end
    
    subgraph master [マスタ管理]
        StoreMgr[店舗管理]
        StaffMgr[スタッフ管理]
        ScenarioMgr[シナリオ管理]
        AccountMgr[アカウント管理]
    end
    
    subgraph analytics [分析・設定]
        Sales[売上管理]
        License[ライセンス管理]
        Settings[設定]
    end
    
    Dashboard --> ScheduleMgr
    Dashboard --> ReservationMgr
    Dashboard --> PrivateBooking
    Dashboard --> StoreMgr
    Dashboard --> StaffMgr
    Dashboard --> ScenarioMgr
    Dashboard --> AccountMgr
    Dashboard --> Sales
    Dashboard --> License
    Dashboard --> Settings
```

### 3.2 スケジュール管理フロー

```mermaid
flowchart LR
    subgraph view [表示]
        MonthView[月間カレンダー]
        DayView[日別詳細]
    end
    
    subgraph actions [操作]
        AddEvent[公演追加]
        EditEvent[公演編集]
        CancelEvent[公演中止]
        ImportEvents[一括インポート]
    end
    
    subgraph modal [モーダル]
        EventForm[公演フォーム]
        ImportModal[インポート]
    end
    
    MonthView --> DayView
    DayView --> AddEvent
    DayView --> EditEvent
    DayView --> CancelEvent
    MonthView --> ImportEvents
    AddEvent --> EventForm
    EditEvent --> EventForm
    ImportEvents --> ImportModal
```

### 3.3 シナリオ管理フロー

```mermaid
flowchart LR
    subgraph list [一覧]
        ScenarioList[シナリオ一覧]
    end
    
    subgraph detail [詳細]
        ScenarioEdit[シナリオ編集]
    end
    
    subgraph sections [セクション]
        BasicInfo[基本情報]
        Pricing[料金設定]
        GMCosts[GM報酬]
        License[ライセンス料]
        Visual[ビジュアル]
        Props[必要備品]
    end
    
    ScenarioList --> ScenarioEdit
    ScenarioEdit --> BasicInfo
    ScenarioEdit --> Pricing
    ScenarioEdit --> GMCosts
    ScenarioEdit --> License
    ScenarioEdit --> Visual
    ScenarioEdit --> Props
```

### 3.4 画面一覧

| 画面 | パス | 機能 |
|-----|------|------|
| ダッシュボード | `/dashboard` | 本日の公演、直近の予約 |
| スケジュール管理 | `/schedule` | 公演の登録・編集・中止 |
| 予約管理 | `/reservations` | 予約の確認・変更・キャンセル |
| 貸切管理 | `/private-booking-management` | 貸切リクエストの承認・却下 |
| 店舗管理 | `/stores` | 店舗情報のCRUD |
| スタッフ管理 | `/staff` | スタッフ情報・招待・権限 |
| シナリオ管理 | `/scenarios` | シナリオのCRUD |
| シナリオ編集 | `/scenarios/edit?id={id}` | シナリオ詳細編集 |
| アカウント管理 | `/accounts` | ユーザー・顧客管理 |
| 売上管理 | `/sales` | 売上分析・レポート |
| ライセンス管理 | `/license-management` | ライセンス報告・集計 |
| 設定 | `/settings` | 組織設定・テナント管理 |

---

## 4. GMスタッフフロー

### 4.1 スタッフ専用機能

```mermaid
flowchart TB
    subgraph staff [スタッフ機能]
        StaffHome[スタッフホーム]
    end
    
    subgraph shift [シフト]
        ShiftSubmit[シフト提出]
        ShiftCalendar[カレンダー入力]
        ShiftConfirm[提出確認]
    end
    
    subgraph gm [GM確認]
        GMCheck[GM確認回答]
        GMRequest[リクエスト一覧]
        GMResponse[回答入力]
    end
    
    subgraph profile [プロフィール]
        StaffProfile[担当作品]
    end
    
    StaffHome --> ShiftSubmit
    StaffHome --> GMCheck
    StaffHome --> StaffProfile
    ShiftSubmit --> ShiftCalendar
    ShiftCalendar --> ShiftConfirm
    GMCheck --> GMRequest
    GMRequest --> GMResponse
```

### 4.2 シフト提出フロー

```mermaid
sequenceDiagram
    participant Admin as 管理者
    participant Discord as Discord
    participant Staff as スタッフ
    participant System as システム
    participant GSheet as Google Sheets
    
    Admin->>System: シフト提出依頼
    System->>Discord: 通知送信
    Discord->>Staff: 提出依頼通知
    Staff->>System: シフト入力
    System->>Discord: 提出完了通知
    System->>GSheet: シフトデータ同期
```

### 4.3 画面一覧

| 画面 | パス | 機能 |
|-----|------|------|
| シフト提出 | `/shift-submission` | 月間シフト希望入力 |
| GM確認回答 | `/gm-availability` | 貸切リクエストへの空き状況回答 |
| 担当作品 | `/staff-profile` | 担当可能シナリオ確認 |
| マニュアル | `/manual` | 操作マニュアル |

---

## 5. 貸切予約フロー

### 5.1 全体フロー

```mermaid
flowchart TB
    subgraph customer [顧客]
        Request[貸切申込]
        WaitApproval[承認待ち]
        Confirmed[予約確定]
    end
    
    subgraph gm [GM]
        GMNotify[Discord通知]
        GMResponse[空き回答]
    end
    
    subgraph admin [管理者]
        ReviewRequest[リクエスト確認]
        AssignGM[GM割当]
        Approve[承認]
        Reject[却下]
    end
    
    subgraph notification [通知]
        ApprovalEmail[承認メール]
        RejectionEmail[却下メール]
    end
    
    Request --> GMNotify
    GMNotify --> GMResponse
    GMResponse --> ReviewRequest
    ReviewRequest --> AssignGM
    AssignGM --> Approve
    ReviewRequest --> Reject
    Approve --> ApprovalEmail
    ApprovalEmail --> Confirmed
    Reject --> RejectionEmail
    RejectionEmail --> WaitApproval
```

### 5.2 詳細シーケンス

```mermaid
sequenceDiagram
    participant Customer as 顧客
    participant System as システム
    participant Discord as Discord
    participant GM as GM
    participant Admin as 管理者
    
    Customer->>System: 貸切リクエスト送信
    System->>Customer: リクエスト確認メール
    System->>Discord: GM通知
    Discord->>GM: 空き確認依頼
    GM->>System: 空き状況回答
    Admin->>System: リクエスト確認
    Admin->>System: GM割当・日時確定
    Admin->>System: 承認
    System->>Customer: 承認メール
    System->>System: スケジュール登録
    System->>System: 予約登録
```

### 5.3 ステータス遷移

```mermaid
stateDiagram-v2
    [*] --> pending: リクエスト送信
    pending --> gm_checking: GM確認中
    gm_checking --> ready_to_confirm: 回答完了
    ready_to_confirm --> confirmed: 承認
    ready_to_confirm --> rejected: 却下
    pending --> rejected: 却下
    confirmed --> [*]
    rejected --> [*]
```

---

## 6. 認証フロー

### 6.1 ログイン・サインアップ

```mermaid
flowchart TB
    subgraph entry [認証]
        Login[ログイン]
        Signup[新規登録]
        Reset[パスワードリセット]
    end
    
    subgraph invite [招待]
        AcceptInvite[招待受諾]
        SetPassword[パスワード設定]
    end
    
    subgraph destination [遷移先]
        BookingSite[予約サイト]
        Dashboard[ダッシュボード]
        MyPage[マイページ]
    end
    
    Login -->|customer| BookingSite
    Login -->|customer| MyPage
    Login -->|staff/admin| Dashboard
    Signup --> BookingSite
    AcceptInvite --> SetPassword
    SetPassword --> Dashboard
    Reset --> Login
```

### 6.2 招待フロー

```mermaid
sequenceDiagram
    participant Admin as 管理者
    participant System as システム
    participant Email as メール
    participant NewUser as 新規ユーザー
    
    Admin->>System: スタッフ招待
    System->>Email: 招待メール送信
    Email->>NewUser: 招待リンク
    NewUser->>System: リンクアクセス
    System->>NewUser: パスワード設定画面
    NewUser->>System: パスワード設定
    System->>System: ユーザー作成
    System->>System: スタッフ紐付け
    System->>NewUser: ダッシュボードへ
```

### 6.3 画面一覧

| 画面 | パス | 機能 |
|-----|------|------|
| ログイン | `/login` | メール・パスワードでログイン |
| 新規登録 | `/signup` | 顧客アカウント作成 |
| パスワードリセット | `/reset-password` | リセットメール送信 |
| パスワード設定 | `/set-password` | 初回パスワード設定（招待経由） |
| 招待受諾 | `/accept-invitation?token=xxx` | 組織招待の受諾 |

---

## 7. マルチテナントフロー

### 7.1 組織登録フロー

```mermaid
flowchart LR
    subgraph register [セルフサービス登録]
        Step1[組織情報入力]
        Step2[管理者情報入力]
        Step3[確認・同意]
        Complete[登録完了]
    end
    
    subgraph result [結果]
        OrgCreated[組織作成]
        UserCreated[ユーザー作成]
        StaffCreated[スタッフ作成]
        Dashboard[ダッシュボード]
    end
    
    Step1 --> Step2
    Step2 --> Step3
    Step3 --> Complete
    Complete --> OrgCreated
    OrgCreated --> UserCreated
    UserCreated --> StaffCreated
    StaffCreated --> Dashboard
```

### 7.2 テナント管理（ライセンス管理者専用）

```mermaid
flowchart TB
    subgraph settings [設定ページ]
        TenantTab[テナント管理タブ]
    end
    
    subgraph actions [操作]
        ListOrgs[組織一覧]
        CreateOrg[組織作成]
        EditOrg[組織編集]
        InviteOrg[組織招待]
    end
    
    subgraph dialogs [ダイアログ]
        CreateDialog[作成ダイアログ]
        EditDialog[編集ダイアログ]
        InviteDialog[招待ダイアログ]
    end
    
    TenantTab --> ListOrgs
    ListOrgs --> CreateOrg
    ListOrgs --> EditOrg
    ListOrgs --> InviteOrg
    CreateOrg --> CreateDialog
    EditOrg --> EditDialog
    InviteOrg --> InviteDialog
```

### 7.3 画面一覧

| 画面 | パス | 機能 | アクセス |
|-----|------|------|---------|
| 組織登録 | `/organization-register` | セルフサービス登録 | 全員 |
| 招待受諾 | `/accept-invitation` | 組織への参加 | 招待者 |
| 設定 > 組織情報 | `/settings` (タブ) | 自組織の設定 | admin |
| 設定 > テナント管理 | `/settings` (タブ) | 全組織管理 | ライセンス管理者のみ |

---

## 8. 作者ポータルフロー

### 8.1 作者ダッシュボード

```mermaid
flowchart TB
    subgraph author [作者ポータル]
        AuthorDash[作者ダッシュボード]
        Overview[概要]
        Reports[公演報告]
        Scenarios[シナリオ一覧]
    end
    
    subgraph data [表示データ]
        Summary[集計サマリー]
        ReportList[報告一覧]
        ScenarioList[担当シナリオ]
    end
    
    AuthorDash --> Overview
    AuthorDash --> Reports
    AuthorDash --> Scenarios
    Overview --> Summary
    Reports --> ReportList
    Scenarios --> ScenarioList
```

### 8.2 メールアドレスベース認証

```mermaid
sequenceDiagram
    participant Company as 報告会社
    participant System as システム
    participant Email as メール
    participant Author as 作者
    
    Company->>System: シナリオにauthor_email設定
    Company->>System: 公演報告提出
    System->>Email: 作者に通知
    Email->>Author: 報告通知
    Author->>System: ログイン
    System->>Author: 自分宛の全報告を表示
```

---

## 関連ドキュメント

- [pages.md](../pages.md) - 詳細なページ一覧
- [features.md](../features.md) - 機能詳細
- [database-design.md](./database-design.md) - データベース設計
- [api-design.md](./api-design.md) - API設計

