#!/usr/bin/env node
/**
 * Discord Bot メッセージ一括削除スクリプト
 * 
 * 使い方:
 * 1. node scripts/delete-discord-bot-messages.js
 * 2. 対話形式でチャンネルを選択して削除
 * 
 * 環境変数:
 * - DISCORD_BOT_TOKEN: Discord Bot Token
 */

require('dotenv').config()

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD_ID = process.env.DISCORD_GUILD_ID // サーバーID

if (!DISCORD_BOT_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN が設定されていません')
  console.error('   .env ファイルに DISCORD_BOT_TOKEN を追加してください')
  process.exit(1)
}

const readline = require('readline')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const ask = (question) => new Promise(resolve => rl.question(question, resolve))

// Discord API リクエスト
async function discordAPI(endpoint, method = 'GET', body = null) {
  const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  })
  
  if (response.status === 429) {
    const data = await response.json()
    console.log(`⏳ レート制限中... ${data.retry_after}秒待機`)
    await new Promise(r => setTimeout(r, data.retry_after * 1000 + 100))
    return discordAPI(endpoint, method, body)
  }
  
  if (!response.ok && response.status !== 204) {
    const text = await response.text()
    throw new Error(`Discord API Error: ${response.status} - ${text}`)
  }
  
  if (response.status === 204) return null
  return response.json()
}

// ボット情報を取得
async function getBotInfo() {
  return discordAPI('/users/@me')
}

// サーバー内のチャンネル一覧を取得
async function getGuildChannels(guildId) {
  return discordAPI(`/guilds/${guildId}/channels`)
}

// チャンネル内のメッセージを取得（最大100件）
async function getMessages(channelId, before = null) {
  let endpoint = `/channels/${channelId}/messages?limit=100`
  if (before) endpoint += `&before=${before}`
  return discordAPI(endpoint)
}

// メッセージを削除
async function deleteMessage(channelId, messageId) {
  return discordAPI(`/channels/${channelId}/messages/${messageId}`, 'DELETE')
}

// 一括削除（14日以内のメッセージのみ、2-100件）
async function bulkDeleteMessages(channelId, messageIds) {
  if (messageIds.length < 2) {
    // 1件の場合は個別削除
    if (messageIds.length === 1) {
      await deleteMessage(channelId, messageIds[0])
    }
    return
  }
  return discordAPI(`/channels/${channelId}/messages/bulk-delete`, 'POST', { messages: messageIds })
}

// チャンネル内のボットメッセージを取得
async function getBotMessagesInChannel(channelId, botId, maxMessages = 500) {
  const allMessages = []
  let lastId = null
  
  while (allMessages.length < maxMessages) {
    const messages = await getMessages(channelId, lastId)
    if (!messages || messages.length === 0) break
    
    const botMessages = messages.filter(m => m.author.id === botId)
    allMessages.push(...botMessages)
    
    lastId = messages[messages.length - 1].id
    
    // 100件未満なら最後まで取得した
    if (messages.length < 100) break
    
    // レート制限対策
    await new Promise(r => setTimeout(r, 200))
  }
  
  return allMessages
}

// メッセージを削除（14日以内のものは一括、それ以外は個別）
async function deleteMessages(channelId, messages) {
  const now = Date.now()
  const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000)
  
  // 14日以内のメッセージ
  const recentMessages = messages.filter(m => {
    const timestamp = new Date(m.timestamp).getTime()
    return timestamp > fourteenDaysAgo
  })
  
  // 14日より古いメッセージ
  const oldMessages = messages.filter(m => {
    const timestamp = new Date(m.timestamp).getTime()
    return timestamp <= fourteenDaysAgo
  })
  
  let deleted = 0
  
  // 14日以内のメッセージは一括削除
  if (recentMessages.length > 0) {
    console.log(`  📦 ${recentMessages.length}件を一括削除中...`)
    const ids = recentMessages.map(m => m.id)
    
    // 100件ずつ一括削除
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      try {
        await bulkDeleteMessages(channelId, chunk)
        deleted += chunk.length
        process.stdout.write(`  ✅ ${deleted}/${messages.length} 削除完了\r`)
        await new Promise(r => setTimeout(r, 1000)) // レート制限対策
      } catch (e) {
        console.error(`  ❌ 一括削除エラー: ${e.message}`)
        // 個別削除にフォールバック
        for (const id of chunk) {
          try {
            await deleteMessage(channelId, id)
            deleted++
            process.stdout.write(`  ✅ ${deleted}/${messages.length} 削除完了\r`)
            await new Promise(r => setTimeout(r, 500))
          } catch (e2) {
            console.error(`  ❌ 削除失敗 (${id}): ${e2.message}`)
          }
        }
      }
    }
  }
  
  // 14日より古いメッセージは個別削除
  if (oldMessages.length > 0) {
    console.log(`\n  🕐 ${oldMessages.length}件を個別削除中（14日以上前のメッセージ）...`)
    for (const msg of oldMessages) {
      try {
        await deleteMessage(channelId, msg.id)
        deleted++
        process.stdout.write(`  ✅ ${deleted}/${messages.length} 削除完了\r`)
        await new Promise(r => setTimeout(r, 500)) // レート制限対策
      } catch (e) {
        console.error(`  ❌ 削除失敗 (${msg.id}): ${e.message}`)
      }
    }
  }
  
  console.log(`\n  ✨ 完了: ${deleted}件削除`)
  return deleted
}

async function main() {
  console.log('🤖 Discord Bot メッセージ削除ツール\n')
  
  // ボット情報を取得
  const bot = await getBotInfo()
  console.log(`ボット: ${bot.username}#${bot.discriminator} (ID: ${bot.id})\n`)
  
  // サーバーIDを入力または環境変数から取得
  let guildId = GUILD_ID
  if (!guildId) {
    guildId = await ask('サーバーID（Discord Developer Modeでサーバーを右クリック→IDをコピー）: ')
  }
  
  // チャンネル一覧を取得
  console.log('\n📋 チャンネル一覧を取得中...')
  const channels = await getGuildChannels(guildId)
  const textChannels = channels.filter(c => c.type === 0) // テキストチャンネルのみ
  
  console.log(`\n見つかったテキストチャンネル: ${textChannels.length}件\n`)
  
  // 各チャンネルのボットメッセージ数を確認
  const channelStats = []
  for (const channel of textChannels) {
    process.stdout.write(`  チェック中: #${channel.name}...\r`)
    try {
      const messages = await getBotMessagesInChannel(channel.id, bot.id, 200)
      if (messages.length > 0) {
        channelStats.push({
          id: channel.id,
          name: channel.name,
          messageCount: messages.length,
          messages: messages
        })
        console.log(`  #${channel.name}: ${messages.length}件のボットメッセージ`)
      }
      await new Promise(r => setTimeout(r, 300))
    } catch (e) {
      // アクセス権がないチャンネルはスキップ
    }
  }
  
  if (channelStats.length === 0) {
    console.log('\n✅ ボットメッセージは見つかりませんでした')
    rl.close()
    return
  }
  
  const totalMessages = channelStats.reduce((sum, c) => sum + c.messageCount, 0)
  console.log(`\n📊 合計: ${channelStats.length}チャンネル、${totalMessages}件のボットメッセージ\n`)
  
  // 削除オプションを選択
  console.log('削除オプション:')
  console.log('  1. 全チャンネルのボットメッセージを削除')
  console.log('  2. チャンネルを選択して削除')
  console.log('  3. キャンセル')
  
  const option = await ask('\n選択 (1-3): ')
  
  if (option === '3') {
    console.log('キャンセルしました')
    rl.close()
    return
  }
  
  if (option === '1') {
    // 全チャンネル削除
    const confirm = await ask(`\n⚠️  ${totalMessages}件のメッセージを削除します。よろしいですか？ (yes/no): `)
    if (confirm.toLowerCase() !== 'yes') {
      console.log('キャンセルしました')
      rl.close()
      return
    }
    
    console.log('\n🗑️  削除開始...\n')
    let totalDeleted = 0
    for (const channel of channelStats) {
      console.log(`\n#${channel.name} (${channel.messageCount}件):`)
      const deleted = await deleteMessages(channel.id, channel.messages)
      totalDeleted += deleted
    }
    console.log(`\n✨ 完了！合計 ${totalDeleted}件のメッセージを削除しました`)
    
  } else if (option === '2') {
    // チャンネル選択
    console.log('\n削除するチャンネルを選択:')
    channelStats.forEach((c, i) => {
      console.log(`  ${i + 1}. #${c.name} (${c.messageCount}件)`)
    })
    
    const selection = await ask('\n番号をカンマ区切りで入力 (例: 1,3,5) または "all": ')
    
    let selectedChannels
    if (selection.toLowerCase() === 'all') {
      selectedChannels = channelStats
    } else {
      const indices = selection.split(',').map(s => parseInt(s.trim()) - 1)
      selectedChannels = indices.filter(i => i >= 0 && i < channelStats.length).map(i => channelStats[i])
    }
    
    if (selectedChannels.length === 0) {
      console.log('チャンネルが選択されませんでした')
      rl.close()
      return
    }
    
    const totalToDelete = selectedChannels.reduce((sum, c) => sum + c.messageCount, 0)
    const confirm = await ask(`\n⚠️  ${selectedChannels.length}チャンネル、${totalToDelete}件のメッセージを削除します。よろしいですか？ (yes/no): `)
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('キャンセルしました')
      rl.close()
      return
    }
    
    console.log('\n🗑️  削除開始...\n')
    let totalDeleted = 0
    for (const channel of selectedChannels) {
      console.log(`\n#${channel.name} (${channel.messageCount}件):`)
      const deleted = await deleteMessages(channel.id, channel.messages)
      totalDeleted += deleted
    }
    console.log(`\n✨ 完了！合計 ${totalDeleted}件のメッセージを削除しました`)
  }
  
  rl.close()
}

main().catch(e => {
  console.error('エラー:', e)
  rl.close()
  process.exit(1)
})

