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
- Advisors do Supabase: zero alertas de segurança após as novas migrations.

## Google Calendar / iPhone — etapa bidirecional implementada no código e banco

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

### Edge Functions do Calendar preparadas no repositório

- `google-calendar-sync`
- `google-calendar-watch`
- `google-calendar-webhook`
- `google-calendar-maintenance`

A ativação/deploy funcional dessas funções ficará para a etapa em que as credenciais reais da conta Google da Carla forem configuradas. A tentativa de publicação direta nesta sessão foi bloqueada pela camada de segurança da ferramenta ao empacotar lógica OAuth/segredos; nenhuma credencial foi exposta.

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

- Conta Google que será proprietária da agenda profissional.
- Criar/selecionar a agenda `Spa Carla Lira — Agendamentos`.
- OAuth Client ID.
- OAuth Client Secret.
- Refresh Token/autorização da agenda.
- Calendar ID da agenda dedicada.
- `CALENDAR_SYNC_SECRET` para a rotina de manutenção.
- Adicionar a conta Google ao Calendário do iPhone e habilitar a agenda profissional.
- Após as credenciais: publicar as quatro Edge Functions, iniciar full sync e registrar o canal `watch`.

### Administrador do painel

- Criar o usuário da Carla em Supabase Auth.
- Promover explicitamente o perfil correspondente de `staff` para `admin`.

## Não fazer ainda

- Não fazer merge para `main`.
- Não ativar WhatsApp/Calendar em produção sem credenciais reais e testes de ponta a ponta.
- Não remover o fallback `wa.me` até a Cloud API estar funcional.
