# Arquitetura — Massoterapeuta Home CRM

## Objetivo

Transformar o site institucional em uma plataforma operacional para Carla Lira, mantendo o frontend atual e adicionando:

- cadastro e histórico de clientes;
- agenda real com prevenção de conflito de horários;
- sincronização com Google Calendar;
- WhatsApp Business Platform / Cloud API;
- confirmações, lembretes, cancelamentos e remarcações;
- consentimento de comunicação e marketing;
- CRM com etapas do cliente;
- painel administrativo;
- catálogo, respostas rápidas e campanhas de relacionamento.

## Visão geral

```text
Cliente
  |
  v
Site público (HTML/CSS/JS)
  |
  | HTTPS
  v
Supabase Edge Functions
  |------------------------------|
  v                              v
Postgres / Auth              Integrações externas
  |                              |
  |                              |-- Google Calendar API
  |                              |-- WhatsApp Cloud API
  |
  v
Painel administrativo da Carla
```

## Regra de segurança principal

O navegador nunca recebe chaves privadas da Meta, Google ou Supabase Secret/Service Role.

O frontend público acessa somente endpoints controlados. Clientes e agendamentos não ficam liberados diretamente para o papel `anon`.

## Componentes

### 1. Frontend público

Responsabilidades:

- listar serviços e pacotes;
- consultar horários livres;
- iniciar agendamento;
- coletar nome, telefone, serviço, modalidade, data e horário;
- coletar consentimentos separados para mensagens operacionais e marketing;
- permitir cancelamento/remarcação através de links assinados ou fluxo no WhatsApp.

O campo de observações deve evitar coleta desnecessária de dados sensíveis. Informações clínicas/saúde, quando realmente necessárias, devem ser mínimas, opcionais, protegidas e nunca usadas para segmentação de marketing.

### 2. Supabase Auth

Inicialmente apenas a profissional terá conta administrativa.

Perfis:

- `admin`: Carla / responsável pelo negócio;
- futuramente `staff`: colaborador com permissões limitadas.

Autorização deve vir da tabela `profiles` ou de `app_metadata`, nunca de `user_metadata`.

### 3. Banco de dados

Entidades principais:

- `profiles`
- `services`
- `service_packages`
- `clients`
- `client_consents`
- `availability_rules`
- `blocked_periods`
- `appointments`
- `appointment_events`
- `whatsapp_contacts`
- `whatsapp_conversations`
- `whatsapp_messages`
- `message_templates`
- `quick_replies`
- `campaigns`
- `campaign_recipients`
- `notification_jobs`
- `audit_logs`

### 4. Edge Functions

Endpoints planejados:

#### Público

- `public-services`
- `public-availability`
- `create-booking`
- `booking-action`

#### Admin

- `admin-appointments`
- `admin-clients`
- `admin-campaigns`

#### Integrações

- `google-calendar-sync`
- `google-oauth-start`
- `google-oauth-callback`
- `whatsapp-webhook`
- `whatsapp-send`
- `whatsapp-template-sync`

#### Automação

- `process-notification-jobs`
- `schedule-reminders`

## Fluxo de agendamento

```text
1. Cliente escolhe serviço
2. Site consulta public-availability
3. Cliente escolhe horário
4. create-booking valida novamente o horário no servidor
5. Banco cria appointment
6. Sistema cria/atualiza evento no Google Calendar
7. Sistema cria job de confirmação
8. WhatsApp envia confirmação quando permitido
9. Webhook atualiza status da mensagem
```

A disponibilidade deve sempre ser validada novamente no servidor para impedir dupla reserva.

## Fluxo Google Calendar

O Google Calendar será uma projeção da agenda do Supabase, e não a fonte principal dos dados.

O banco continua sendo a fonte de verdade. Cada `appointment` guarda `google_event_id`.

Criação:

```text
appointment -> events.insert -> google_event_id salvo no Supabase
```

Remarcação:

```text
appointment atualizado -> events.patch/update
```

Cancelamento:

```text
appointment.status = cancelled -> evento Google cancelado/removido
```

O ID do evento pode ser derivado do UUID do agendamento para ajudar na idempotência.

## Fluxo WhatsApp

### Entrada

Meta Webhook -> `whatsapp-webhook` -> valida assinatura -> salva evento/mensagem -> atualiza CRM.

### Saída

Sistema -> `notification_jobs` -> `whatsapp-send` -> Cloud API -> webhook de status.

### Janela de atendimento

Dentro da janela de atendimento do WhatsApp, respostas livres podem ser usadas conforme as regras da plataforma. Fora dela, mensagens iniciadas pela empresa usam templates aprovados.

## CRM

Estágios sugeridos:

1. `new_lead`
2. `waiting_response`
3. `waiting_confirmation`
4. `scheduled`
5. `attended`
6. `follow_up`
7. `recurring`
8. `cancelled`

Esses estágios são controlados no Supabase. As etiquetas do aplicativo WhatsApp Business podem continuar sendo usadas pela Carla, mas não são tratadas como a fonte principal do CRM.

## Consentimentos

Separar pelo menos:

- `whatsapp_service`: confirmação, lembrete, remarcação e informações do atendimento;
- `whatsapp_marketing`: ofertas, retorno, campanhas e novidades.

Registrar:

- cliente;
- categoria;
- concedido/revogado;
- data/hora;
- origem (`website`, `whatsapp`, `admin` etc.);
- versão do texto de consentimento.

Revogação deve ser respeitada imediatamente.

## Automações iniciais

### Confirmação

Disparo após criação do agendamento.

### Lembrete 24h

Job periódico procura atendimentos confirmados nas próximas 24h e cria notificações idempotentes.

### Pós-atendimento

Após o horário final da sessão, o painel permite marcar como realizado e agendar mensagem de acompanhamento.

### Retorno

Campanhas de relacionamento somente para clientes com consentimento de marketing ativo.

## Catálogo

O catálogo comercial pode ser mantido no WhatsApp Business/Meta com os mesmos serviços do site. O banco `services` será a fonte interna para descrição, duração, preço e status de disponibilidade.

Não haverá sincronização automática de catálogo na primeira versão. Primeiro garantiremos que conteúdo, preços e políticas estejam corretos; a automação via Meta pode ser adicionada depois.

## Respostas rápidas

O painel terá uma biblioteca própria de respostas reutilizáveis (`quick_replies`) e a Carla poderá manter também atalhos equivalentes no aplicativo WhatsApp Business.

Sugestões:

- `/valores`
- `/endereco`
- `/homecare`
- `/horarios`
- `/preparo`
- `/pacote4`
- `/pacote8`
- `/confirmar`
- `/pix`
- `/remarcar`
- `/cancelar`

## Marketing

Campanhas nunca devem ser disparos indiscriminados.

Cada campanha deve:

- selecionar somente contatos com opt-in de marketing;
- usar template aprovado quando exigido;
- registrar destinatários e resultado;
- permitir opt-out;
- impedir novo envio para contatos revogados/bloqueados;
- aplicar limite de frequência configurável.

## Painel administrativo — V1

### Dashboard

- atendimentos hoje;
- horários livres;
- pendentes de confirmação;
- cancelamentos;
- clientes para retorno.

### Agenda

- visual diário/semanal;
- criar, editar, remarcar e cancelar;
- bloqueio de períodos;
- sincronização Google Calendar.

### Clientes

- dados de contato;
- histórico de sessões;
- pacote atual;
- estágio CRM;
- consentimentos;
- histórico de comunicação.

### WhatsApp

- modelos/templates;
- respostas rápidas;
- status de mensagens;
- fila de notificações.

### Campanhas

- criar campanha;
- segmentar somente por critérios não sensíveis;
- pré-visualizar;
- enviar;
- acompanhar resultados.

## Fonte de verdade

- Supabase: clientes, disponibilidade, agendamentos, consentimentos, CRM e auditoria.
- Google Calendar: visualização e rotina diária da agenda.
- WhatsApp: canal de comunicação.
- Site: aquisição e autosserviço do cliente.

## Ordem de implementação

1. Criar projeto Supabase exclusivo.
2. Criar schema + RLS.
3. Criar API pública de serviços/disponibilidade/agendamento.
4. Adaptar formulário do site.
5. Criar painel administrativo.
6. Integrar Google Calendar.
7. Integrar WhatsApp Cloud API e webhook.
8. Criar templates e notificações.
9. Criar CRM e campanhas.
10. Configurar catálogo, perfil, respostas rápidas e operação do WhatsApp Business.
11. Testes de segurança, concorrência, cancelamento e idempotência.
