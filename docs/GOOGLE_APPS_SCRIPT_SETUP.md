# Google Apps Script メール送信設定

## 1. Google Apps Script の作成

1. https://script.google.com/ にアクセス
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を「MMQ Email Sender」に変更

## 2. コードを貼り付け

以下のコードを `コード.gs` に貼り付けてください：

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { to, subject, body } = data;
    
    // 送信先が配列の場合は結合
    const recipients = Array.isArray(to) ? to.join(',') : to;
    
    // メール送信
    GmailApp.sendEmail(recipients, subject, body);
    
    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: 'メールを送信しました' })
    ).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// テスト用の関数
function testEmail() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        to: 'test@example.com',
        subject: 'テストメール',
        body: 'これはテストメールです。'
      })
    }
  });
  Logger.log(result.getContent());
}
```

## 3. デプロイ

1. 右上の「デプロイ」→「新しいデプロイ」をクリック
2. 「種類の選択」→「ウェブアプリ」を選択
3. 設定：
   - **説明**: MMQ Email Sender v1
   - **次のユーザーとして実行**: 自分
   - **アクセスできるユーザー**: 全員
4. 「デプロイ」をクリック
5. **ウェブアプリのURL** をコピー（例: `https://script.google.com/macros/s/xxxxx/exec`）

## 4. 環境変数の設定

コピーしたURLを `.env.local` に追加：

```bash
VITE_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/xxxxx/exec
```

## 5. 権限の承認

初回デプロイ時に権限の承認が必要です：

1. 「承認が必要」と表示されたら「権限を確認」をクリック
2. Googleアカウントを選択
3. 「詳細」→「MMQ Email Sender（安全ではないページ）に移動」をクリック
4. 「許可」をクリック

## 注意事項

- Gmail の送信制限: 1日あたり約100通（無料アカウント）、1500通（Google Workspace）
- 送信元は Google Apps Script を実行するアカウントのメールアドレスになります
- テスト時は自分のメールアドレスに送信して確認してください

