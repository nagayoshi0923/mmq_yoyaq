# マーダーミステリー店舗管理システム デザインガイドライン

## 全体方針
- **プロフェッショナル**: 業務用管理システムとして信頼性と効率性を重視
- **情報密度**: 多くの情報を整理して表示する管理画面として、適切な情報密度を保つ
- **日本語対応**: 日本語UI前提でフォントや行間を最適化
- **アクセシビリティ**: 長時間使用する管理者のために目に優しいデザイン
- **淡くて美しいUI**: 現在の洗練された淡い色調を維持し、上品で見やすいインターフェースを保つ

## 色彩システム

### 基本カラー
- プライマリ: `#030213` (ダークネイビー) - 重要なアクション、選択状態
- セカンダリ: `#ececf0` (ライトグレー) - 補助的な要素
- アクセント: `#e9ebef` (ソフトグレー) - ホバー状態、区切り線

### 店舗識別色（全ページ共通・必須使用）
```css
高田馬場店: 青系
  - Badge/Tag: bg-blue-100 text-blue-800
  - Card/Background: bg-blue-50 border-blue-200
  - アクセント: text-blue-600

別館①: 緑系
  - Badge/Tag: bg-green-100 text-green-800
  - Card/Background: bg-green-50 border-green-200
  - アクセント: text-green-600

別館②: 紫系
  - Badge/Tag: bg-purple-100 text-purple-800
  - Card/Background: bg-purple-50 border-purple-200
  - アクセント: text-purple-600

大久保店: オレンジ系
  - Badge/Tag: bg-orange-100 text-orange-800
  - Card/Background: bg-orange-50 border-orange-200
  - アクセント: text-orange-600

大塚店: 赤系
  - Badge/Tag: bg-red-100 text-red-800
  - Card/Background: bg-red-50 border-red-200
  - アクセント: text-red-600

埼玉大宮店: 茶系
  - Badge/Tag: bg-amber-100 text-amber-800
  - Card/Background: bg-amber-50 border-amber-200
  - アクセント: text-amber-600
```

### 公演カテゴリ色（全ページ共通・必須使用）
```css
オープン公演: ブルー系（メイン公演として信頼感を表現）
  - Badge: bg-blue-100 text-blue-800
  - Card: bg-blue-50 border-blue-200 text-blue-800
  - アクセント: border-blue-300
  - 説明: 一般向けメイン公演

貸切公演: パープル系（特別感・プレミアム感を表現）
  - Badge: bg-purple-100 text-purple-800  
  - Card: bg-purple-50 border-purple-200 text-purple-800
  - アクセント: border-purple-300
  - 説明: プライベート・特別公演

GMテスト: オレンジ系（注意・研修を表現）
  - Badge: bg-orange-100 text-orange-800
  - Card: bg-orange-50 border-orange-200 text-orange-800
  - アクセント: border-orange-300
  - 説明: GM研修・スキルアップ

テストプレイ: イエロー系（実験・検証を表現）
  - Badge: bg-yellow-100 text-yellow-800
  - Card: bg-yellow-50 border-yellow-200 text-yellow-800
  - アクセント: border-yellow-300
  - 説明: 新シナリオ検証・テスト

出張公演: グリーン系（外部・移動を表現）
  - Badge: bg-green-100 text-green-800
  - Card: bg-green-50 border-green-200 text-green-800
  - アクセント: border-green-300
  - 説明: 外部会場での公演
```

### 状態色（全ページ共通）
- 成功: `bg-green-100 text-green-800` (淡いグリーン)
- 警告: `bg-yellow-100 text-yellow-800` (淡いイエロー)
- エラー: `bg-red-100 text-red-800` (淡いレッド)
- 情報: `bg-blue-100 text-blue-800` (淡いブルー)

## タイポグラフィ

### 重要な制約（Tailwind V4高度システム）
- **フォントサイズ、ウェイト、行間のTailwindクラスは使用禁止**
- globals.cssの基本タイポグラフィを使用（自動適用システム）
- 明示的に指定が必要な場合のみオーバーライド

### 自動適用の仕組み
```css
/* globals.cssの高度な制約システム */
:where(:not(:has([class*=" text-"]), :not(:has([class^="text-"])))) {
  /* text-*クラスを使わない限り、自動で美しいタイポグラフィが適用される */
}
```

### CSS変数の活用
```css
/* 明示的にサイズ指定が必要な場合 */
.custom-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-medium);
}
```

### 文字サイズ指針
- h1: システムタイトル、メインヘッダー
- h2: セクションタイトル、ページタイトル  
- h3: サブセクション、カードタイトル
- p: 本文、説明文
- label: フォームラベル、項目名

## コンポーネント設計

### ShadCN UIオーバーライド重要性
ShadCN UIコンポーネントにはデフォルトスタイリングが組み込まれているため、Guidelines準拠には**明示的なクラス指定**が必須：

```jsx
// ✅ 正しい：明示的にGuidelines色を指定
<Card className="bg-blue-50 border-blue-200">
  <Badge className="bg-purple-100 text-purple-800">貸切公演</Badge>
</Card>

// ❌ 危険：デフォルトスタイリングに依存
<Card>  {/* デフォルトの白背景になってしまう */}
  <Badge>貸切公演</Badge>  {/* デフォルトの灰色になってしまう */}
</Card>
```

### カード・パネル
- 背景: `bg-card` (白/ダーク対応) **または** 店舗識別色 `bg-*-50`
- 境界線: `border-border` (薄いグレー) **または** 店舗識別色 `border-*-200`
- 角丸: `rounded-lg` (統一)
- 影: 最小限、必要な場合のみ

### ボタン
- Primary: `bg-primary text-primary-foreground` - 主要アクション
- Secondary: `bg-secondary text-secondary-foreground` - 補助アクション  
- Outline: `border border-input` - 取り消し、戻る
- Ghost: `hover:bg-accent` - アイコンボタン、軽微なアクション

### テーブル・リスト
- ヘッダー: `bg-muted` で区別
- 行間: 適度な`py-2`以上で読みやすさ確保
- ホバー: `hover:bg-muted/50`
- 選択: `bg-accent`

### フォーム
- 入力欄背景: `bg-input-background` 
- フォーカス: `focus:ring-2 focus:ring-ring`
- エラー: `border-destructive`でアウトライン表示（背景色なし）

## 全ページ共通 色使用ルール

### 優先順位と使い分け
1. **店舗識別** (最優先): 全てのデータ表示で店舗を色で識別
2. **公演カテゴリ** (高優先): スケジュール、予約、売上等で公演種別を色分け
3. **ステータス** (中優先): アクション結果、データ状態の表示
4. **システム** (基本): UI基盤となる基本色

### 複合表示のルール
同一要素で複数の色分けが必要な場合：
```jsx
// 店舗色を最優先（背景）+ カテゴリ色をバッジで表現
<Card className="bg-blue-50 border-blue-200"> {/* 店舗色 */}
  <Badge className="bg-purple-100 text-purple-800">貸切公演</Badge> {/* カテゴリ色 */}
</Card>

// または店舗アイコン + カテゴリ背景
<div className="bg-orange-50 border-orange-200"> {/* カテゴリ色 */}
  <div className="w-3 h-3 bg-blue-500 rounded-full"></div> {/* 店舗色ドット */}
</div>
```

### 淡い色調の維持
- **背景色**: 必ず `*-50` (最も淡い) を使用
- **境界線**: `*-200` で上品な区切りを表現
- **テキスト**: `*-800` で十分なコントラストを確保
- **アクセント**: `*-100` でほんのり強調

## 情報表示パターン

### ステータス表示
- Badge形式で統一
- 背景色は薄く、テキストはコントラスト確保
- 例: `bg-green-100 text-green-800`

### 数値・統計
- 大きな数字は`text-lg`以上
- 単位や説明は`text-muted-foreground`
- 増減は色で表現（緑=増加、赤=減少）

### 警告・通知
- 背景色は使わず`border-2`でアウトライン表示
- アイコンで種別を明示
- `text-destructive`, `text-warning`等でテキスト色のみ使用

## レイアウト

### 間隔
- セクション間: `space-y-6`
- コンポーネント間: `space-y-4`  
- 要素間: `gap-2`〜`gap-4`

### グリッド・レスポンシブ
- メインコンテンツ: `container mx-auto px-4`
- カード配置: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- タブレット・モバイル対応必須

## インタラクション

### ホバー効果
- 軽微な色変化、過度なアニメーションは避ける
- `hover:bg-muted/50`, `hover:bg-accent`
- カーソル: `cursor-pointer`で明示

### フォーカス
- キーボードナビゲーション対応
- `focus:ring-2 focus:ring-ring focus:ring-offset-2`

### ローディング
- スケルトン表示推奨
- スピナーは最小限
- `animate-pulse`でプレースホルダー

## 店舗管理特有のルール

### 店舗別表示
- 店舗名には必ず識別色のドットやバッジを付与
- 店舗フィルターでは色分けを活用
- 店舗切り替え時は視覚的フィードバック必須

### データテーブル
- ソート可能カラムには矢印アイコン
- ページネーション必須（大量データ対応）
- 行選択時は`bg-accent`で強調

### タブナビゲーション  
- アクティブタブは`bg-background`で明示
- アイコン + テキストの組み合わせ
- モバイルでは必要に応じて省略

## 使用例とベストプラクティス

### 公演カテゴリの表示例
```jsx
// Badge使用例
<Badge className="bg-blue-100 text-blue-800">オープン公演</Badge>
<Badge className="bg-purple-100 text-purple-800">貸切公演</Badge>
<Badge className="bg-orange-100 text-orange-800">GMテスト</Badge>
<Badge className="bg-yellow-100 text-yellow-800">テストプレイ</Badge>
<Badge className="bg-green-100 text-green-800">出張公演</Badge>

// Card使用例  
<Card className="bg-purple-50 border-purple-200 text-purple-800">
  <CardHeader>
    <CardTitle>貸切公演の詳細</CardTitle>
  </CardHeader>
  <CardContent>
    プライベート公演の内容...
  </CardContent>
</Card>
```

### 店舗 + カテゴリの複合表示
```jsx
// 推奨パターン1: 店舗背景 + カテゴリバッジ
<Card className="bg-blue-50 border-blue-200"> {/* 高田馬場店 */}
  <div className="flex items-center gap-2">
    <h3>高田馬場店</h3>
    <Badge className="bg-purple-100 text-purple-800">貸切公演</Badge>
  </div>
</Card>

// 推奨パターン2: カテゴリ背景 + 店舗ドット
<Card className="bg-orange-50 border-orange-200"> {/* GMテスト */}
  <div className="flex items-center gap-2">
    <div className="w-3 h-3 bg-blue-500 rounded-full"></div> {/* 高田馬場店 */}
    <span>GMテスト</span>
  </div>
</Card>
```

## 避けるべき表現
- 過度な装飾やグラデーション
- 派手な色使い（ゲーム業界だがB2B管理画面として節度を保つ）
- 複雑なアニメーション
- 小さすぎるクリック領域（最低44px確保）
- 背景色による警告表示（アウトライン表示を使用）
- 濃い背景色（`*-100`以上は避ける、`*-50`を基本とする）

## 新規開発者向けクイックチェック

### 実装前の必須確認
1. **色指定**: 店舗識別色・公演カテゴリ色を正確に使用しているか？
2. **タイポグラフィ**: `text-*`, `font-*`, `leading-*`クラスを使用していないか？
3. **ShadCNオーバーライド**: デフォルトスタイリングをGuidelines色で上書きしているか？
4. **レスポンシブ**: `container mx-auto px-4` + `space-y-6`を使用しているか？
5. **淡い色調**: 背景*-50、境界線*-200、テキスト*-800を維持しているか？

### デバッグ・品質確認
- **色の一貫性**: 同じ店舗・カテゴリで色が統一されているか？
- **コントラスト**: テキストの可読性は十分か？
- **アクセシビリティ**: フォーカス状態・ホバー状態が適切か？
- **モバイル対応**: 小画面でのレイアウト崩れはないか？

## Tailwind V4 + globals.css連携システム

### 高度な制約システムの理解
```css
/* globals.cssの天才的な仕組み */
:where(:not(:has([class*=" text-"]), :not(:has([class^="text-"])))) {
  /* この条件により、text-*クラスを使わない限り自動適用 */
  h2 { font-size: var(--text-xl); font-weight: var(--font-weight-medium); }
}
```

この制約により：
- ✅ **自動美化**: 何もしなくても美しいタイポグラフィ
- ✅ **デザイン保護**: 勝手にフォントサイズを変更できない
- ✅ **一貫性保証**: 全ページで統一されたタイポグラフィ

### CSS変数の活用（高度）
```jsx
// 特殊なケースでのCSS変数使用例
<div style={{ 
  fontSize: 'var(--text-2xl)', 
  fontWeight: 'var(--font-weight-medium)',
  color: 'var(--color-blue-800)' 
}}>
  カスタムタイトル
</div>
```

## 色システムの拡張ルール

### 新しいカテゴリ追加時
1. 既存の5色（blue, purple, orange, yellow, green）と被らない色を選択
2. 必ず `*-50`, `*-100`, `*-200`, `*-800` の組み合わせを使用
3. 全ページで一貫して使用すること
4. デザインガイドラインに追加すること

### 色の濃度統一
- 背景: 常に `*-50` (最も淡い)
- Badge: 常に `*-100` (淡い) + `*-800` (濃いテキスト)  
- 境界線: 常に `*-200` (薄い境界線)
- アクセント: 常に `*-300` (中間の強調)

この色システムは **全ページ共通** で使用し、マーダーミステリー店舗管理システム全体の **統一されたブランドアイデンティティ** を維持してください。