import { createAdminClient } from '../_shared/supabase.ts'
import { json, normalizeBrazilPhone } from '../_shared/http.ts'
import { resolveBusinessFromWhatsAppPhoneNumber } from '../_shared/business.ts'

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return new Uint8Array()
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)))
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function verifySignature(rawBody: string, header: string | null) {
  const appSecret = Deno.env.get('META_APP_SECRET')
  if (!appSecret || !header?.startsWith('sha256=')) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
  return equalBytes(signed, hexToBytes(header.slice(7)))
}

function messagePreview(message: any) {
  if (message?.type === 'text') return String(message.text?.body ?? '').slice(0, 500)
  if (message?.type === 'button') return String(message.button?.text ?? '').slice(0, 500)
  if (message?.type === 'interactive') {
    return String(message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? '[interativo]').slice(0, 500)
  }
  return `[${String(message?.type ?? 'mensagem')}]`
}

async function getOrCreateClient(supabase: any, businessId: string, phone: string, profileName: string) {
  const now = new Date().toISOString()
  const { data: existing, error: existingError } = await supabase
    .from('clients')
    .select('id, full_name, crm_stage, source')
    .eq('business_id', businessId)
    .eq('phone_e164', phone)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing) {
    const { error: updateError } = await supabase
      .from('clients')
      .update({ last_contact_at: now, updated_at: now })
      .eq('business_id', businessId)
      .eq('id', existing.id)
    if (updateError) throw updateError
    return existing
  }

  const { data: created, error: createError } = await supabase
    .from('clients')
    .insert({
      business_id: businessId,
      full_name: profileName,
      phone_e164: phone,
      source: 'whatsapp',
      crm_stage: 'new_lead',
      last_contact_at: now,
      updated_at: now,
    })
    .select('id, full_name, crm_stage, source')
    .single()

  if (createError) throw createError
  return created
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const mode = (url.searchParams.get('hub.mode') ?? '').trim()
    const token = (url.searchParams.get('hub.verify_token') ?? '').trim()
    const challenge = url.searchParams.get('hub.challenge')
    const expected = (
      Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ??
      Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ??
      ''
    ).trim()

    if (mode === 'subscribe' && token && expected && token === expected && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const rawBody = await req.text()
  if (!(await verifySignature(rawBody, req.headers.get('x-hub-signature-256')))) {
    return new Response('Invalid signature', { status: 401 })
  }

  try {
    const payload = JSON.parse(rawBody)
    const supabase = createAdminClient()

    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {}
        const phoneNumberId = String(value?.metadata?.phone_number_id ?? '') || null
        const business = await resolveBusinessFromWhatsAppPhoneNumber(supabase, phoneNumberId)
        if (!business) {
          console.warn('whatsapp_webhook_unmapped_phone_number', phoneNumberId)
          continue
        }

        const profileName = value?.contacts?.[0]?.profile?.name ?? 'Contato WhatsApp'

        for (const message of value?.messages ?? []) {
          const phone = normalizeBrazilPhone(message?.from)
          if (!phone) continue

          const client = await getOrCreateClient(supabase, business.id, phone, profileName)

          await supabase.from('whatsapp_contacts').upsert({
            business_id: business.id,
            client_id: client.id,
            wa_id: String(message.from),
            profile_name: profileName,
            last_inbound_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'client_id' })

          const { data: currentConversation } = await supabase
            .from('whatsapp_conversations')
            .select('id')
            .eq('business_id', business.id)
            .eq('client_id', client.id)
            .is('closed_at', null)
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const windowUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          let conversationId = currentConversation?.id

          if (conversationId) {
            await supabase.from('whatsapp_conversations').update({
              last_message_at: new Date().toISOString(),
              customer_service_window_until: windowUntil,
            }).eq('business_id', business.id).eq('id', conversationId)
          } else {
            const { data: created, error: conversationError } = await supabase
              .from('whatsapp_conversations')
              .insert({
                business_id: business.id,
                client_id: client.id,
                last_message_at: new Date().toISOString(),
                customer_service_window_until: windowUntil,
              })
              .select('id')
              .single()
            if (conversationError) throw conversationError
            conversationId = created.id
          }

          await supabase.from('whatsapp_messages').upsert({
            business_id: business.id,
            conversation_id: conversationId,
            client_id: client.id,
            meta_message_id: message.id,
            direction: 'inbound',
            status: 'received',
            message_type: message.type ?? 'unknown',
            body_preview: messagePreview(message),
            payload: message,
            created_at: message.timestamp
              ? new Date(Number(message.timestamp) * 1000).toISOString()
              : new Date().toISOString(),
          }, { onConflict: 'business_id,meta_message_id', ignoreDuplicates: true })
        }

        for (const status of value?.statuses ?? []) {
          const patch: Record<string, unknown> = { status: status.status }
          const timestamp = status.timestamp
            ? new Date(Number(status.timestamp) * 1000).toISOString()
            : new Date().toISOString()

          if (status.status === 'sent') patch.sent_at = timestamp
          if (status.status === 'delivered') patch.delivered_at = timestamp
          if (status.status === 'read') patch.read_at = timestamp
          if (status.status === 'failed') {
            patch.failed_at = timestamp
            patch.failure_reason = JSON.stringify(status.errors ?? []).slice(0, 1000)
          }

          await supabase.from('whatsapp_messages')
            .update(patch)
            .eq('business_id', business.id)
            .eq('meta_message_id', status.id)
        }
      }
    }

    return new Response('EVENT_RECEIVED', { status: 200 })
  } catch (error) {
    console.error('whatsapp_webhook_error', error)
    return new Response('EVENT_RECEIVED', { status: 200 })
  }
})
