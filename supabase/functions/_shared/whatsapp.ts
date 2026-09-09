const GRAPH_VERSION = 'v26.0'

function getEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export async function sendWhatsApp(payload: Record<string, unknown>) {
  const phoneNumberId = getEnv('WHATSAPP_PHONE_NUMBER_ID')
  const accessToken = getEnv('WHATSAPP_ACCESS_TOKEN')

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`WhatsApp API ${response.status}: ${JSON.stringify(data)}`)
  }

  return data
}

export function toWaRecipient(phoneE164: string) {
  return phoneE164.replace(/\D/g, '')
}
