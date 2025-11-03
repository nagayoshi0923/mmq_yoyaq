# ステータスバッジの判定ロジック

## 現在の実装

### ステータスの種類
- `available`: 「予約受付中」（緑）
- `few_seats`: 「残りわずか (残りX席)」（オレンジ）
- `sold_out`: 「完売」（赤）
- `private_booking`: 「貸切受付中」（グレー）

### 判定フロー

#### 1. シナリオのフィルタリング
```typescript
// ステータスがavailableでないシナリオはスキップ
if (scenario.status !== 'available') return
```
→ シナリオテーブルの`status`が`'available'`でないものは表示されない

#### 2. 公演がある場合（`scenarioEvents.length > 0`）

**a) 貸切公演の場合**
```typescript
const isPrivateBooking = nextEvent.is_private_booking === true
if (isPrivateBooking) {
  status = 'sold_out'  // ← ここが問題かも
  availableSeats = 0
}
```

**b) 通常公演の場合**
```typescript
const available = max_participants - current_participants
status = getAvailabilityStatus(max_participants || 8, current_participants || 0)
```

**`getAvailabilityStatus`関数のロジック:**
```typescript
function getAvailabilityStatus(max: number, current: number) {
  const available = max - current
  
  // 1. 空席が0席 → 'sold_out'
  if (available === 0) return 'sold_out'
  
  // 2. 空席が最大人数の20%以下 → 'few_seats'
  const threshold = Math.max(1, Math.floor(max * 0.2))
  if (available <= threshold) return 'few_seats'
  
  // 3. それ以外 → 'available'
  return 'available'
}
```

**判定例:**
- 最大8人、現在5人 → 空席3席 → 閾値1.6（切り捨て1） → `'available'`
- 最大8人、現在7人 → 空席1席 → 閾値1.6（切り捨て1） → `'few_seats'`
- 最大10人、現在8人 → 空席2席 → 閾値2 → `'few_seats'`
- 最大10人、現在9人 → 空席1席 → 閾値2 → `'few_seats'`
- 最大10人、現在10人 → 空席0席 → `'sold_out'`

#### 3. 公演がない場合（`scenarioEvents.length === 0`）
```typescript
status = 'private_booking'  // 「貸切受付中」
```

## 問題点

### 1. 貸切公演のステータス
現在、貸切公演は`'sold_out'`になっていますが、実際には貸切予約を受け付けている状態なので、`'private_booking'`の方が適切かもしれません。

```typescript
// 現在
const status = isPrivateBooking ? 'sold_out' : getAvailabilityStatus(...)

// 改善案
const status = isPrivateBooking ? 'private_booking' : getAvailabilityStatus(...)
```

### 2. 最も近い公演のみで判定
複数公演がある場合、最も近い1つの公演の空席状況のみで判定しています。
- 例：来週満席、再来週空席がある場合でも「完売」と表示される

### 3. 最大人数のフォールバック
```typescript
nextEvent.max_participants || 8
```
`max_participants`が`null`や`undefined`の場合、デフォルトで8人として扱われますが、実際のシナリオの最大人数と異なる可能性があります。

### 4. 20%の閾値が適切か
- 最大8人の場合：閾値1.6 → 1席以下が「残りわずか」
- 最大10人の場合：閾値2 → 2席以下が「残りわずか」
- 最大15人の場合：閾値3 → 3席以下が「残りわずか」

小人数シナリオでは1席でも「残りわずか」、大人数シナリオでは3席でも「残りわずか」になるため、絶対値で判定する方が分かりやすい可能性があります。

## 改善提案

### 提案1: 貸切公演のステータスを`private_booking`に変更
```typescript
const status = isPrivateBooking ? 'private_booking' : getAvailabilityStatus(...)
```

### 提案2: 複数公演を考慮した判定
```typescript
// すべての公演が満席 → 'sold_out'
// すべての公演が残りわずか → 'few_seats'
// 1つでも空席がある → 'available'
```

### 提案3: 絶対値での判定に変更
```typescript
function getAvailabilityStatus(max: number, current: number) {
  const available = max - current
  if (available === 0) return 'sold_out'
  if (available <= 2) return 'few_seats'  // 2席以下は常に「残りわずか」
  return 'available'
}
```

### 提案4: シナリオの最大人数を優先
```typescript
const maxParticipants = nextEvent.max_participants || scenario.player_count_max || 8
const status = getAvailabilityStatus(maxParticipants, nextEvent.current_participants || 0)
```

