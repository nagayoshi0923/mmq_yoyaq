import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'
import path from 'node:path'
const mocks=path.resolve('e2e/fixtures/functional-qa-mocks.tsx')
const config = mergeConfig(base({command:'serve',mode:'test'}),{cacheDir:'/tmp/mmq-functional-vite-cache',resolve:{alias:['@/lib/apiClient','@/lib/supabase','@/lib/reservationApi','@/lib/assignmentApi','@/lib/organization','@/contexts/AuthContext','@/components/layout/AppLayout','@/components/layout/Header','@/components/layout/NavigationBar','@/components/InviteShareButton','@/pages/BookingConfirmation/hooks/useBookingCoupon'].map(name=>({find:new RegExp('^'+name+'$'),replacement:mocks}))},server:{host:'127.0.0.1',port:5196,strictPort:true,proxy:{}},optimizeDeps:{entries:['e2e/fixtures/functional-qa.html']}})

config.server!.proxy = {} // mergeConfigでbaseのstaging proxyを引き継がない
export default defineConfig(config)
