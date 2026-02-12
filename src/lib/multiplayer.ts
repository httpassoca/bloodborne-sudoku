import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type MpMode = 'coop' | 'versus'

type PresenceState = {
  name?: string
  joinedAt?: number
  // versus stats
  finished?: boolean
  errors?: number
  timeSec?: number
  score?: number
}

export type CoopCellPatch = {
  r: number
  c: number
  value?: number
  cornerNotes?: number[]
  centerNotes?: number[]
  at: number
  by: string
}

export type CoopState = {
  v: 1
  puzzle: number[][]
  // keep solution optional (allows hiding in future)
  solution?: number[][]
  // canonical cells (value + notes)
  cells: Array<
    Array<{
      value: number
      cornerNotes: number[]
      centerNotes: number[]
    }>
  >
  startedAt: number
  at: number
}

export type BroadcastMsg =
  | { type: 'hello'; by: string; name?: string; mode: MpMode; at: number }
  | { type: 'state_request'; by: string; at: number }
  | { type: 'state_response'; by: string; to: string; state: CoopState; at: number }
  | { type: 'coop_patch'; by: string; patch: CoopCellPatch; at: number }
  | { type: 'versus_stats'; by: string; stats: PresenceState; at: number }

export function makeSupabase(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  }
  return createClient(url, key)
}

export function makeRoomCode() {
  // short-ish room code (not crypto)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 7; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

export function makeClientId() {
  const a = Math.random().toString(36).slice(2)
  const b = Date.now().toString(36)
  return `${b}-${a}`.slice(0, 18)
}

export function normalizeName(s: string) {
  const t = String(s || '').trim().slice(0, 24)
  return t || 'Hunter'
}
