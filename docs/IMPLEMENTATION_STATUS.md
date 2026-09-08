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
- Estrutura de Google Calendar e WhatsApp Cloud API já versionada no repositório.

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

### Google Calendar

- Conta Google que será proprietária da agenda da Carla.
- OAuth Client ID.
- OAuth Client Secret.
- Refresh Token/autorização da agenda.
- Calendar ID da agenda dedicada.

### Administrador do painel

- Criar o usuário da Carla em Supabase Auth.
- Promover explicitamente o perfil correspondente de `staff` para `admin`.

### Vercel

- A conexão Vercel disponível nesta sessão não retornou uma equipe/projeto utilizável para importação automática do GitHub.
- Assim que a conta/equipe correta estiver conectada, importar `Duduzzn22/massoterapeuta-home`, usar a branch `feature/crm-whatsapp-calendar` para Preview e manter `main` como Production Branch.

## Não fazer ainda

- Não fazer merge para `main`.
- Não publicar WhatsApp/Calendar em produção sem credenciais reais e testes.
- Não remover o fallback `wa.me` até a Cloud API estar funcional.
