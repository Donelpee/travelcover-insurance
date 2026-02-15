import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envText = fs.readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
)

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

const supabase = createClient(url, key)

const { data, error } = await supabase
  .from('scheduled_jobs')
  .delete()
  .not('id', 'is', null)
  .select('id')

if (error) {
  throw error
}

console.log(`Deleted scheduled_jobs rows: ${data?.length ?? 0}`)
