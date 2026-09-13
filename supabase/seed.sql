-- Dados iniciais adicionais para Massoterapeuta Home
-- Horário comercial atual informado no site: segunda a sexta, 08:00–17:00,
-- com intervalo de almoço entre 12:00 e 13:00.

insert into public.availability_rules (weekday, start_time, end_time, slot_interval_minutes, active)
select d.weekday, d.start_time::time, d.end_time::time, 60, true
from (
  values
    (1, '08:00', '12:00'), (1, '13:00', '18:00'),
    (2, '08:00', '12:00'), (2, '13:00', '18:00'),
    (3, '08:00', '12:00'), (3, '13:00', '18:00'),
    (4, '08:00', '12:00'), (4, '13:00', '18:00'),
    (5, '08:00', '12:00'), (5, '13:00', '18:00')
) as d(weekday, start_time, end_time)
where not exists (
  select 1 from public.availability_rules ar
  where ar.weekday = d.weekday
    and ar.start_time = d.start_time::time
    and ar.end_time = d.end_time::time
);

insert into public.service_packages (name, description, session_count, active)
select 'Pacote 4 Sessões', 'Acompanhamento com 4 sessões.', 4, true
where not exists (select 1 from public.service_packages where name = 'Pacote 4 Sessões');

insert into public.service_packages (name, description, session_count, active)
select 'Pacote 8 Sessões', 'Acompanhamento com 8 sessões.', 8, true
where not exists (select 1 from public.service_packages where name = 'Pacote 8 Sessões');

insert into public.message_templates (name, language_code, category, status, purpose, body, active)
select
  'agendamento_recebido', 'pt_BR', 'UTILITY', 'draft', 'Confirmação de solicitação',
  'Olá {{1}}. Recebemos sua solicitação para {{2}} em {{3}} às {{4}}. Em breve confirmaremos seu atendimento.', true
where not exists (select 1 from public.message_templates where name = 'agendamento_recebido');

insert into public.message_templates (name, language_code, category, status, purpose, body, active)
select
  'lembrete_24h', 'pt_BR', 'UTILITY', 'draft', 'Lembrete de atendimento',
  'Olá {{1}}. Lembrando do seu atendimento de {{2}} amanhã, {{3}}, às {{4}}.', true
where not exists (select 1 from public.message_templates where name = 'lembrete_24h');

insert into public.message_templates (name, language_code, category, status, purpose, body, active)
select
  'retorno_30_dias', 'pt_BR', 'MARKETING', 'draft', 'Reativação de clientes com consentimento',
  'Olá {{1}}. Já faz um tempo desde sua última sessão. Temos novos horários disponíveis caso queira cuidar de você novamente.', true
where not exists (select 1 from public.message_templates where name = 'retorno_30_dias');
