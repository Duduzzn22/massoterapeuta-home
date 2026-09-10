# Status da implementação — Massoterapeuta Home

## Concluído nesta etapa

- Projeto Supabase exclusivo `massoterapeuta-home` criado em `sa-east-1`.
- Schema de CRM, clientes, consentimentos, agenda, WhatsApp, campanhas e auditoria aplicado.
- RLS habilitado em todas as tabelas públicas.
- Papel `anon` sem acesso direto às tabelas.
- Papel `authenticated` com acesso via Data API protegido pelas policies RLS.
- Índices de chaves estrangeiras adicionados após execução dos advisors de performance.
- Trigger seguro para criação automática de perfil `staff` a partir do Supabase Auth.
- Serviços, pacotes, horários, respostas rápidas e templates iniciais carregados.
- Edge Function `availability` publicada.
- Edge Function `create-booking` publicada.
- Formulário público atualizado para consultar horários reais e salvar agendamentos no Supabase.
- Consentimento operacional e de marketing separados no formulário.
- Atendimento no Spa e Home Care incluídos.
- Painel `admin.html` criado com login, agenda, clientes, CRM, WhatsApp e campanhas.
- Responsividade reforçada para site e painel, incluindo navegação e tabelas mobile.
- Projeto Vercel conectado ao GitHub e Preview da branch `feature/crm-whatsapp-calendar` funcionando.
- Advisors do Supabase sem alertas de segurança de nível warning/error.
- Proteção anti-spam do agendamento com honeypot e limite por telefone/IP.
- Política de Privacidade publicada e vinculada ao formulário.
- Histórico de migrations do projeto real recuperado e versionado no Git.

## Google Calendar / iPhone — integração bidirecional ativa

- Calendário do iPhone definido como interface operacional da Carla.
- Google Calendar definido como ponte entre iPhone e Supabase.
- Migration `google_calendar_bidirectional_sync` aplicada no projeto real.
- `calendar_sync_state` criado para guardar `syncToken`, canal `watch`, expiração e estado de sincronização.
- `blocked_periods` preparado para eventos pessoais vindos do Google/iPhone.
- `appointments` preparado para `etag`, `updated` e rastreamento da última sincronização Google.
- Eventos do CRM recebem `extendedProperties.private.appointment_id` para identificação segura.
- Eventos pessoais do iPhone viram apenas bloqueios de disponibilidade e não criam clientes no CRM.
- Eventos transparentes/livres não bloqueiam horários.
- Eventos de dia inteiro são suportados.
- Remarcação feita no iPhone atualiza o Supabase quando o novo horário é válido.
- Se a remarcação pelo iPhone gerar conflito com outro agendamento ativo, o PostgreSQL rejeita a mudança e o evento do Google é restaurado para o horário anterior.
- Exclusão/cancelamento de evento de cliente pelo iPhone cancela o appointment correspondente.
- Full sync + sincronização incremental com `syncToken` implementadas.
- Recuperação automática após HTTP 410 / sync token inválido implementada.
- Webhook Google valida canal, resource ID, hash do token e número de mensagem.
- Renovação de canal `watch` antes do vencimento implementada.
- Rotina diária de manutenção/sync de segurança implementada no repositório.

### Edge Functions do Calendar publicadas

- `google-calendar-sync`
- `google-calendar-watch`
- `google-calendar-webhook`
- `google-calendar-maintenance`

- Sincronização incremental validada no ambiente real em 10/09/2026.
- Canal de push ativo e associado à empresa correta.
- Manutenção automática agendada a cada 12 horas pelo `pg_cron`.
- Segredo do worker gerado no PostgreSQL, guardado no Supabase Vault e validado por hash.
- Worker de repetição de criação de eventos corrigido para usar empresa, agenda e fuso horário.
- Fluxos de sync, webhook, bloqueios e agendamentos isolados por `business_id`.
- Cancelamento pelo painel remove o evento correspondente do Google Calendar.
- Endpoint legado `google-calendar-bootstrap` desativado e protegido por JWT.

## Ainda depende de credenciais/configuração externa

### Meta / WhatsApp Cloud API

- Meta Business da Carla.
- WhatsApp Business Account (WABA).
- Phone Number ID.
- Access Token permanente/sistema.
- App Secret.
- Verify Token para o webhook.
- Templates aprovados pela Meta.
- Configuração do catálogo e perfil comercial no WhatsApp Business.

### Google Calendar / iPhone

- Manter a conta Google profissional adicionada ao Calendário do iPhone.
- Não remover o acesso OAuth do aplicativo na conta Google.
- Monitorar o campo `last_error` de `calendar_sync_state` nas verificações operacionais.

### Administrador do painel

- Criar o usuário da Carla em Supabase Auth.
- Promover explicitamente o perfil correspondente de `staff` para `admin`.

## Não fazer ainda

- Não fazer merge para `main`.
- Não fazer alterações manuais nos segredos do Calendar armazenados no Vault.
- Não remover o fallback `wa.me` até a Cloud API estar funcional.
