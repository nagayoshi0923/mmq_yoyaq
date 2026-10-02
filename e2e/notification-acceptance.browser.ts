import { test,expect } from '@playwright/test'
for(const action of ['公演更新','貸切予約更新','公演移動']){
 for(const mode of ['invoke_error','business_false','invoke_throw','read_error','missing_email','accepted','save_error']){
  test(`${action} / ${mode}で保存と通知を分離する`,async({page})=>{
   const external:string[]=[]
   await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'&&url.port==='5194')return route.continue();external.push(url.origin);return route.abort()})
   page.on('dialog',dialog=>dialog.accept()) // 現行native confirmを受ける。実通知ではない。
   await page.goto('/e2e/fixtures/notification-acceptance.html')
   await page.getByRole('combobox',{name:'試験応答'}).selectOption(mode)
   await page.getByRole('button',{name:action,exact:true}).click()
   await expect(page.getByTestId('save-result')).toHaveText(mode==='save_error'?'保存失敗':'保存済み')
   const counts=JSON.parse(await page.getByTestId('counts').textContent()||'{}')
   expect(counts.saved).toBe(mode==='save_error'?0:1)
   expect(counts.sent).toBe(['save_error','read_error','missing_email'].includes(mode)?0:1)
   if(mode==='save_error')await expect(page.locator('[data-sonner-toast]')).toContainText('失敗')
   else if(mode==='accepted'){
    await expect(page.getByText('変更は保存しましたが、通知メールの送信を確認できませんでした。',{exact:true})).toHaveCount(0)
    if(action!=='公演移動')await expect(page.locator('[data-sonner-toast]')).toContainText('保存しました')
   }else{
    await expect(page.locator('[data-sonner-toast]')).toContainText('変更は保存しました')
    await expect(page.locator('[data-sonner-toast]')).toContainText('再保存せず')
    await expect(page.locator('[data-sonner-toast]')).toBeInViewport({ratio:1})
    await expect(page.getByText('保存しました',{exact:true})).toHaveCount(0)
    if(action==='公演更新' || action==='公演移動')await expect(page.getByTestId('saved-date')).toContainText('2027-01-17')
   }
   expect(external).toEqual([])
   if(action==='公演更新'&&mode==='invoke_error')await page.screenshot({path:'/tmp/mmq-notification-save-warning.png',fullPage:true,animations:'disabled'})
   if(action==='公演移動'&&mode==='business_false')await page.screenshot({path:'/tmp/mmq-notification-move-warning.png',fullPage:true,animations:'disabled'})
  })
 }
}
