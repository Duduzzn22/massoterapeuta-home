# Google Calendar — integração

## Objetivo

Sincronizar cada agendamento do Supabase com uma agenda da Carla sem transformar o Google Calendar na fonte principal dos dados.

## Fonte de verdade

- Supabase = fonte principal
- Google Calendar = espelho operacional da agenda

Cada agendamento guarda o campo `google_event_id`.

## Estratégia recomendada

Usar OAuth 2.0 da própria conta Google da Carla com acesso à agenda escolhida.

Por ser um sistema de uma única profissional, o fluxo será feito uma vez no painel administrativo:

1. Carla clica em `Conectar Google Calendar`.
2. É redirecionada ao Google.
3. Autoriza o acesso à agenda.
4. O callback retorna ao Supabase Edge Function.
5. O sistema guarda o refresh token de forma protegida.
6. O painel passa a sincronizar eventos automaticamente.

## Escopo

Solicitar apenas o escopo necessário para editar o calendário utilizado pelo sistema.

## Agenda recomendada

Criar uma agenda separada, por exemplo:

**Spa Carla Lira — Agendamentos**

Isso evita misturar compromissos pessoais com dados operacionais.

## Criação de evento

Ao confirmar um agendamento:

```text
Título: Drenagem Linfática — Mariana
Início: 15/09/2026 14:00
Fim: 15/09/2026 15:00
Local: Spa Carla Lira ou Home Care
Descrição: ID interno do agendamento + telefone mascarado
```

Evitar colocar dados sensíveis de saúde na descrição do evento.

## Idempotência

O ID interno do Supabase deve ser associado ao evento do Google para impedir duplicação em caso de retry.

Fluxo:

```text
appointment.id -> evento Google -> google_event_id
```

Antes de criar um novo evento, verificar se `google_event_id` já existe.

## Remarcação

1. Atualizar o agendamento no Supabase.
2. Atualizar o mesmo evento no Google.
3. Registrar `appointment_event` de remarcação.
4. Criar job de WhatsApp para confirmação da nova data.

## Cancelamento

1. Alterar status para `cancelled`.
2. Cancelar/remover evento correspondente no Google.
3. Registrar auditoria.
4. Enviar confirmação pelo WhatsApp quando permitido.

## Conflito de agenda

A prevenção principal de dupla reserva está no banco por constraint de sobreposição.

Antes de confirmar um horário, o sistema também pode consultar o Google Calendar para detectar bloqueios externos feitos manualmente pela Carla.

No futuro podemos suportar dois tipos de indisponibilidade:

- `blocked_periods` criados no painel;
- eventos ocupados encontrados no Google Calendar.

## Credenciais

Necessárias na etapa de produção:

- Google OAuth Client ID
- Google OAuth Client Secret
- Redirect URI
- Calendar ID

Nunca armazenar segredo Google no frontend ou no GitHub.

## Edge Functions previstas

- `google-oauth-start`
- `google-oauth-callback`
- `google-calendar-sync`
- `google-calendar-webhook` (opcional, para sincronização bidirecional futura)

## V1 vs V2

### V1

Supabase -> Google Calendar

O painel cria/remarca/cancela e replica no Google.

### V2

Google Calendar -> Supabase

Alterações feitas manualmente na agenda podem ser recebidas pelo sistema e refletidas no banco, com regras para evitar loops de sincronização.
