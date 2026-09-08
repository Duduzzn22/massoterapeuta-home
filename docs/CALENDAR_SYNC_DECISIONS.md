# Decisões — sincronização bidirecional do calendário

## Interface da profissional

Carla continuará usando o aplicativo Calendário nativo do iPhone.

A agenda profissional será uma agenda Google exibida dentro do app Calendário da Apple.

## Fluxos oficiais

### Sistema para iPhone

`Supabase -> Google Calendar -> Calendário do iPhone`

### iPhone para sistema

`Calendário do iPhone -> Google Calendar -> push webhook -> sync incremental -> Supabase`

## Regras de negócio

1. Supabase continua sendo a fonte principal do CRM e das regras de disponibilidade.
2. Alterações de horário feitas pela Carla no iPhone são aceitas quando não geram sobreposição com outro appointment ativo.
3. Conflitos são rejeitados pelo banco e o evento Google é restaurado ao horário anterior.
4. Eventos pessoais criados diretamente na agenda profissional não criam clientes nem appointments.
5. Eventos pessoais ocupados são espelhados como `blocked_periods`.
6. Eventos pessoais transparentes/livres não bloqueiam disponibilidade.
7. Títulos de eventos pessoais não são armazenados no CRM; o motivo do bloqueio é genérico para preservar privacidade.
8. Eventos de dia inteiro são tratados como bloqueios integrais.
9. Exclusão de um evento que representa appointment cancela o appointment correspondente.
10. Eventos do CRM são identificados por `google_event_id` e por `extendedProperties.private.appointment_id`.

## Segurança

- Webhook Google sem JWT porque é chamado pelo Google, mas protegido por token de canal aleatório.
- Somente o hash SHA-256 do token de canal é persistido.
- Channel ID, Resource ID e Message Number são validados.
- Funções administrativas continuam exigindo usuário `admin` autenticado.
- A rotina de manutenção usa `CALENDAR_SYNC_SECRET` separado.
- Segredos Google nunca são enviados ao navegador ou commitados no GitHub.

## Confiabilidade

- Full sync inicial.
- Sync incremental por `nextSyncToken`.
- HTTP 410 força nova full sync.
- Push notification não depende de conteúdo no corpo da requisição; ao receber aviso, o sistema consulta a API.
- Canal `watch` é renovado antes de expirar.
- Manutenção diária executa sync incremental adicional como rede de segurança.
