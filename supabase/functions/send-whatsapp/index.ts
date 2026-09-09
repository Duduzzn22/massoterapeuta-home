import { requireAdmin } from '../_shared/auth.ts'
import { handleOptions, json, cleanText } from '../_shared/http.ts'
import { sendWhatsApp, toWaRecipient } from '../_shared/whatsapp.ts'
import { userCanAccessBusiness } from '../_shared/business.ts'

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const auth = await requireAdmin(req)
    if (!auth) return json({ error: 'Acesso não autorizado.' }, 403)

    const body = await req.json()
    const clientId = cleanText(body?.client_id, 80)
    const mode = body?.mode === 'template' ? 'template' : 'text'

    const { data: client, error: clientError } = await auth.supabase
      .from('clients')
      .select('id, business_id, full_name, phone_e164, blocked')
      .eq('id', clientId)
      .maybeSingle()

    if (clientError) throw clientError
    if (!client || client.blocked) return json({ error: 'Cliente indisponível para contato.' }, 404)

    if (!(await userCanAccessBusiness(auth.supabase, auth.user.id, client.business_id))) {
      return json({ error: 'Você não tem acesso a esta empresa.' }, 403)
    }

    let apiPayload: Record<string, unknown>
    let bodyPreview = ''
    let templateName: string | null = null

    if (mode === 'template') {
      templateName = cleanText(body?.template_name, 120)
      const languageCode = cleanText(body?.language_code, 20) || 'pt_BR'
      const components = Array.isArray(body?.components) ? body.components : []

      const { data: template, error: templateError } = await auth.supabase
        .from('message_templates')
        .select('name, status, body, active')
        .eq('business_id', client.business_id)
        .eq('name', templateName)
        .eq('active', true)
        .maybeSingle()

      if (templateError) throw templateError
      if (!template || String(template.status).toLowerCase() !== 'approved') {
        return json({ error: 'Template não está aprovado/ativo.' }, 409)
      }

      apiPayload = {
        to: toWaRecipient(client.phone_e164),
        type: 'template',
        template: { name: templateName, language: { code: languageCode }, components },
      }
      bodyPreview = template.body ?? templateName
    } else {
      const text = cleanText(body?.text, 4000)
      if (!text) return json({ error: 'Mensagem vazia.' }, 400)

      const { data: conversation, error: conversationError } = await auth.supabase
        .from('whatsapp_conversations')
        .select('id, customer_service_window_until')
        .eq('business_id', client.business_id)
        .eq('client_id', client.id)
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (conversationError) throw conversationError
      const windowUntil = conversation?.customer_service_window_until
        ? new Date(conversation.customer_service_window_until).getTime()
        : 0

      if (windowUntil <= Date.now()) {
        return json({ error: 'A janela de atendimento expirou. Use um template aprovado.' }, 409)
      }

      apiPayload = {
        to: toWaRecipient(client.phone_e164),
        type: 'text',
        text: { preview_url: false, body: text },
      }
      bodyPreview = text
    }

    const { data: phoneConfig, error: phoneConfigError } = await auth.supabase
      .from('whatsapp_phone_numbers')
      .select('phone_number_id')
      .eq('business_id', client.business_id)
      .eq('active', true)
      .not('phone_number_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (phoneConfigError) throw phoneConfigError

    const response = await sendWhatsApp(apiPayload, { phoneNumberId: phoneConfig?.phone_number_id ?? null })
    const metaMessageId = response?.messages?.[0]?.id ?? null

    await auth.supabase.from('whatsapp_messages').insert({
      business_id: client.business_id,
      client_id: client.id,
      meta_message_id: metaMessageId,
      direction: 'outbound',
      status: 'sent',
      message_type: mode,
      template_name: templateName,
      body_preview: bodyPreview.slice(0, 500),
      payload: apiPayload,
      sent_at: new Date().toISOString(),
    })

    await auth.supabase.from('audit_logs').insert({
      business_id: client.business_id,
      actor_user_id: auth.user.id,
      action: 'whatsapp_message_sent',
      entity_type: 'client',
      entity_id: client.id,
      payload: { mode, template_name: templateName, meta_message_id: metaMessageId },
    })

    return json({ ok: true, message_id: metaMessageId })
  } catch (error) {
    console.error('send_whatsapp_error', error)
    return json({ error: 'Não foi possível enviar a mensagem.' }, 500)
  }
})
