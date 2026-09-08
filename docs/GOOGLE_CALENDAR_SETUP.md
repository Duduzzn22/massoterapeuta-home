# Google Calendar + Calendário do iPhone — integração bidirecional

## Objetivo

Permitir que Carla continue usando o aplicativo **Calendário** nativo do iPhone como interface diária da agenda, enquanto o sistema mantém CRM, disponibilidade e automações no Supabase.

Arquitetura:

```text
Site / Painel
      ↓
   Supabase
      ↕
Google Calendar
      ↕
Calendário do iPhone
```

O iPhone não se conecta diretamente ao Supabase. A conta Google da agenda profissional é adicionada ao app Calendário da Apple e o Google funciona como ponte de sincronização.

## Fonte de verdade e regra de conflito

- Supabase continua sendo a fonte principal do CRM e das regras de reserva.
- Google Calendar é a ponte operacional e aceita alterações feitas pela Carla no iPhone.
- Alterações vindas do iPhone são refletidas no Supabase quando são válidas.
- A constraint de sobreposição do PostgreSQL continua impedindo dois agendamentos ativos no mesmo horário.
- Se Carla tentar mover no iPhone um agendamento para um horário já ocupado, o Supabase rejeita a mudança e o sistema restaura o evento do Google para o horário anterior.

## Agenda recomendada

Criar uma agenda Google separada:

**Spa Carla Lira — Agendamentos**

Adicionar essa conta/agenda no iPhone e deixar o app Calendário da Apple exibi-la normalmente.

Isso permite que Carla continue usando o aplicativo que já conhece, sem precisar trabalhar dentro do app Google Calendar.

## O que acontece com eventos criados no iPhone

### Evento que pertence a um cliente do sistema

Os eventos criados pelo CRM recebem:

- `google_event_id` no Supabase;
- `extendedProperties.private.source = massoterapeuta-home` no Google;
- `extendedProperties.private.appointment_id = <uuid>` no Google.

Se Carla mover esse evento no Calendário do iPhone:

```text
Calendário do iPhone
→ Google Calendar
→ webhook
→ syncToken incremental
→ Supabase
→ appointment.starts_at / ends_at
```

A alteração também gera um `appointment_event` para auditoria.

### Evento pessoal criado manualmente

Um evento criado pela Carla diretamente nessa agenda e que não pertence ao CRM **não cria cliente nem atendimento**.

Ele é convertido em `blocked_periods`:

```text
Evento pessoal no iPhone
→ Google Calendar
→ Supabase blocked_periods
→ horário deixa de aparecer no site
```

Por privacidade, o sistema não precisa guardar o título pessoal do evento. O bloqueio é armazenado apenas como:

`Ocupado — Calendário da Carla`

Eventos marcados como transparentes/livres não bloqueiam agenda.

Eventos de dia inteiro bloqueiam o respectivo período integral.

## Cancelamento pelo iPhone

Se Carla apagar/cancelar um evento que corresponde a um agendamento do CRM:

- o agendamento passa para `cancelled`;
- o horário volta a ficar disponível;
- é registrado `google_calendar_cancelled_from_iphone`.

Mensagens automáticas de WhatsApp decorrentes desse cancelamento só serão ativadas depois que a Cloud API estiver configurada.

## Push notifications do Google

A função pública:

`google-calendar-webhook`

recebe os cabeçalhos `X-Goog-*` enviados pelo Google Calendar.

Segurança:

- cada canal recebe um token aleatório;
- somente o SHA-256 desse token é armazenado no banco;
- o webhook confere `X-Goog-Channel-ID`, `X-Goog-Resource-ID` e `X-Goog-Channel-Token`;
- canais antigos/desconhecidos são ignorados;
- mensagens repetidas são descartadas usando `X-Goog-Message-Number`.

A notificação do Google não contém o evento alterado. Ela apenas informa que houve mudança. O sistema então chama a API do Calendar usando sincronização incremental.

## Sincronização incremental

Tabela:

`calendar_sync_state`

Armazena:

- `calendar_id`;
- `sync_token`;
- `watch_channel_id`;
- `watch_resource_id`;
- hash do token do canal;
- expiração do canal;
- último número de mensagem;
- datas das últimas sincronizações;
- último erro.

Fluxo:

1. primeira conexão faz full sync;
2. Google devolve `nextSyncToken`;
3. mudanças futuras usam esse token;
4. se o Google invalidar o token com HTTP 410, o sistema executa nova full sync automaticamente.

## Renovação do canal

Canais de push do Google expiram e não possuem renovação automática nativa.

Funções:

- `google-calendar-watch` — controle administrativo: status, start, renew, sync e stop;
- `google-calendar-maintenance` — rotina protegida por `CALENDAR_SYNC_SECRET`;
- `google-calendar-webhook` — recebimento das mudanças.

A manutenção deve ser executada diariamente. Ela:

1. executa uma sincronização incremental de segurança;
2. verifica a expiração do canal;
3. renova quando faltarem menos de 48 horas.

Quando o novo canal é criado, existe uma pequena sobreposição antes do canal antigo ser encerrado, conforme estratégia recomendada pelo Google.

## Fluxo Supabase → iPhone

```text
Cliente agenda no site
→ Supabase cria appointment
→ Google Calendar cria evento
→ iPhone sincroniza a conta Google
→ evento aparece no app Calendário
```

## Fluxo iPhone → Supabase

```text
Carla muda 14:00 para 15:00 no iPhone
→ Google recebe a alteração
→ webhook informa que houve mudança
→ sync incremental recupera o evento
→ Supabase valida conflito
→ appointment passa para 15:00
```

## Credenciais necessárias para ativação

Precisaremos da conta Google que será usada pela Carla e das seguintes configurações:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_CALENDAR_WEBHOOK_URL` (opcional; por padrão usa a Edge Function do projeto)
- `CALENDAR_SYNC_SECRET`

Nunca armazenar essas credenciais no frontend ou no GitHub.

## Configuração no iPhone

Depois da conta Google profissional estar pronta:

1. adicionar a conta Google nas contas de calendário do iPhone;
2. habilitar a sincronização de Calendários;
3. abrir o app Calendário;
4. deixar marcada a agenda **Spa Carla Lira — Agendamentos**.

A Carla poderá continuar visualizando simultaneamente calendários pessoais do iCloud e a agenda profissional do Google.

## Edge Functions

- `google-calendar-sync` — saída Supabase → Google;
- `google-calendar-watch` — inicia/renova/encerra e força sync;
- `google-calendar-webhook` — entrada Google/iPhone → Supabase;
- `google-calendar-maintenance` — renovação periódica + sync de segurança.

## Privacidade

Não inserir em eventos Google/iPhone:

- queixas clínicas detalhadas;
- diagnósticos;
- histórico médico;
- observações sensíveis.

O evento operacional usa apenas serviço, cliente, contato necessário, local e ID interno.
