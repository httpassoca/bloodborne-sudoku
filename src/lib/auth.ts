import { makeSupabase } from './multiplayer'

export function supabaseClient() {
  return makeSupabase()
}

export async function signInWithGoogle() {
  const supabase = supabaseClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })
  if (error) throw error
}

export async function signOut() {
  const supabase = supabaseClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const supabase = supabaseClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}
