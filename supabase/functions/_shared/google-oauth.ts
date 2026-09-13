import { createAdminClient } from './supabase.ts'
import { getCalendarId } from './google-calendar.ts'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

function env(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256Bytes(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256Hex(value: string) {
  const bytes = await sha256Bytes(value)
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function beginGoogleOAuth() {
  const supabase = createAdminClient()
  const state = randomBase64Url(32)
  const codeVerifier = randomBase64Url(64)
  const codeChallenge = bytesToBase64Url(await sha256Bytes(codeVerifier))
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()

  await supabase.from('google_oauth_states').delete().lt('expires_at', now.toISOString())

  const { error } = await supabase.from('google_oauth_states').insert({
    state_hash: await sha256Hex(state),
    code_verifier: codeVerifier,
    expires_at: expiresAt,
  })
  if (error) throw error

  const params = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: env('GOOGLE_REDIRECT_URI'),
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function consumeGoogleOAuthState(state: string) {
  if (!state || state.length < 20) throw new Error('Invalid OAuth state')

  const supabase = createAdminClient()
  const stateHash = await sha256Hex(state)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('google_oauth_states')
    .select('state_hash,code_verifier,expires_at,used_at')
    .eq('state_hash', stateHash)
    .maybeSingle()

  if (error) throw error
  if (!data || data.used_at || data.expires_at <= now) throw new Error('OAuth state expired or already used')

  const { error: markError } = await supabase
    .from('google_oauth_states')
    .update({ used_at: now })
    .eq('state_hash', stateHash)
    .is('used_at', null)
  if (markError) throw markError

  return data.code_verifier as string
}

export async function exchangeGoogleAuthorizationCode(code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    code,
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    redirect_uri: env('GOOGLE_REDIRECT_URI'),
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) {
    throw new Error(`Google token exchange failed (${response.status})`)
  }

  return data as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
  }
}

export async function verifyConfiguredCalendarAccess(accessToken: string) {
  const calendarId = encodeURIComponent(getCalendarId())
  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events?maxResults=1&singleEvents=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Authorized Google account cannot access configured calendar (${response.status})`)
  }
}

export async function storeGoogleRefreshToken(refreshToken: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('set_google_refresh_token', { p_refresh_token: refreshToken })
  if (error) throw error
}
