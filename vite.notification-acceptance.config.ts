import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'
import path from 'node:path'
const mock = path.resolve('e2e/fixtures/notification-acceptance-mocks.ts')
const alias = ['@/lib/supabase','@/lib/api','@/lib/reservationApi','@/lib/api/eventHistoryApi','@/hooks/usePreparationSettings','@/lib/preparationNeighborEvents'].map(name=>({find:new RegExp('^'+name+'$'),replacement:mock}))
const config = mergeConfig(base({command:'serve',mode:'test'}),{
 cacheDir:'/tmp/mmq-notification-vite-cache',optimizeDeps:{entries:['e2e/fixtures/notification-acceptance.html']},
 resolve:{alias},server:{host:'127.0.0.1',port:5194,strictPort:true},
})
config.server!.proxy = {} // fixtureからstagingへproxyしない
export default defineConfig(config)
