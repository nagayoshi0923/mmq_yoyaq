import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  return new Response(JSON.stringify({ message: "discord-interactions-test stub" }), {
    headers: { "Content-Type": "application/json" },
  })
})
