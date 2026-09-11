# WhatsApp Business — configuração operacional

Este documento cobre o app WhatsApp Business e a futura integração com WhatsApp Business Platform / Cloud API.

## 1. Perfil comercial

### Nome

**Carla Almeida Lira | Massoterapia Spa**

### Descrição sugerida

> Massoterapia e bem-estar em Valinhos/SP. Atendimentos no Spa e home care, com sessões personalizadas e foco em conforto, relaxamento e qualidade de vida. Agendamentos pelo WhatsApp.

### Informações

- Endereço: R. Samuel Fragoso Coimbra, 483 - Valinhos - SP
- Horário: segunda a sexta, 8h às 17h
- Site: usar a URL oficial do projeto quando publicada
- E-mail: cadastrar somente o endereço profissional confirmado pela Carla

Manter esses dados iguais no site, Google Business Profile e WhatsApp.

## 2. Catálogo

Cadastrar os mesmos serviços do site:

1. Massagem Sueca
2. Massagem Terapêutica
3. Pedras Quentes
4. Ventosoterapia
5. Drenagem Linfática
6. Miracle Face
7. Pacote 4 Sessões
8. Pacote 8 Sessões

Para cada item:

- foto real/profissional;
- nome idêntico ao site;
- descrição curta;
- duração;
- valor somente após confirmação da tabela de preços;
- link direto para a seção de agendamento do site.

Não usar valores fictícios como `R$ 00` no catálogo de produção.

## 3. Etiquetas / listas operacionais

Sugestão de etiquetas no aplicativo:

- Novo lead
- Aguardando resposta
- Aguardando confirmação
- Agendado
- Atendimento realizado
- Retorno
- Cliente recorrente
- Pacote 4 sessões
- Pacote 8 sessões
- Cancelado

O Supabase terá os estágios equivalentes e será a fonte principal do CRM. As etiquetas do app são uma visão operacional para a Carla.

## 4. Respostas rápidas

### /valores

Olá! Claro. Vou te enviar os valores e as opções de atendimento disponíveis. Você procura uma sessão específica ou gostaria que eu te ajudasse a escolher?

### /endereco

Nosso espaço fica na R. Samuel Fragoso Coimbra, 483 - Valinhos/SP. Se quiser, também posso te enviar a rota.

### /homecare

Também realizamos atendimento home care. Me informe seu bairro e cidade para eu verificar disponibilidade e deslocamento.

### /horarios

Claro. Qual dia ou período você prefere: manhã ou tarde? Vou verificar os horários disponíveis.

### /preparo

Para a sessão, venha com roupas confortáveis e evite refeições muito pesadas logo antes do atendimento. Se houver alguma restrição importante para a profissional saber, informe diretamente no atendimento.

### /pacote4

Temos a opção de pacote com 4 sessões, ideal para quem quer manter uma frequência semanal. Posso te enviar os valores e horários disponíveis.

### /pacote8

Temos também o pacote com 8 sessões, pensado para acompanhamento mais frequente. Posso te explicar as opções de frequência e disponibilidade.

### /confirmar

Perfeito. Seu horário está separado. Assim que concluirmos a confirmação, eu te envio todos os dados do atendimento.

### /pix

Vou te enviar os dados de pagamento e as instruções para confirmação do horário.

### /remarcar

Sem problema. Me diga o novo dia e período que você prefere para verificarmos disponibilidade.

### /cancelar

Entendido. Vou registrar o cancelamento do atendimento. Se quiser, depois posso verificar uma nova data para você.

## 5. Mensagem de saudação

> Olá! Seja bem-vinda ao atendimento da Carla Almeida Lira. 🌿
>
> Posso te ajudar com serviços, valores, disponibilidade, atendimento no Spa ou home care.
>
> Se quiser agendar, me diga qual serviço você procura e o melhor dia para você.

## 6. Mensagem de ausência

> Olá! Recebi sua mensagem. Nosso horário de atendimento é de segunda a sexta, das 8h às 17h.
>
> Assim que retornarmos ao atendimento, responderemos por aqui. Se quiser adiantar, envie o serviço desejado, dia preferido e se o atendimento será no Spa ou home care.

## 7. Templates para Cloud API

Os nomes abaixo são sugestões. A categoria final é determinada/aprovada pela Meta.

### confirmacao_agendamento

> Olá, {{1}}. Seu atendimento com Carla Lira está confirmado para {{2}} às {{3}}.
> Serviço: {{4}}.
> Local: {{5}}.
> Se precisar alterar, responda a esta mensagem.

### lembrete_24h

> Olá, {{1}}. Passando para lembrar do seu atendimento amanhã, {{2}}, às {{3}} com Carla Lira.
> Serviço: {{4}}.
> Local: {{5}}.

### remarcacao_confirmada

> Olá, {{1}}. Seu atendimento foi remarcado para {{2}} às {{3}}.
> Serviço: {{4}}.
> Local: {{5}}.

### cancelamento_confirmado

> Olá, {{1}}. Seu atendimento de {{2}} às {{3}} foi cancelado conforme solicitado. Quando quiser, posso te ajudar a encontrar um novo horário.

### retorno_30_dias

Mensagem de relacionamento/marketing, somente para quem aceitou receber marketing:

> Olá, {{1}}. Já faz um tempo desde sua última sessão com a Carla. Se quiser cuidar novamente do seu momento de bem-estar, posso te mostrar os horários disponíveis desta semana.
>
> Se não quiser mais receber novidades, responda SAIR.

### horarios_disponiveis_semana

Mensagem de marketing, somente com opt-in:

> Olá, {{1}}. Abriram alguns horários para esta semana no Spa Carla Lira. Se quiser, posso te mostrar as opções disponíveis para {{2}}.
>
> Para não receber mais novidades, responda SAIR.

### pacote_recorrencia

Mensagem de marketing, somente com opt-in:

> Olá, {{1}}. Para quem quer manter uma rotina de bem-estar, temos opções de pacotes com sessões recorrentes. Quer receber os detalhes do pacote de {{2}} sessões?
>
> Para não receber mais novidades, responda SAIR.

## 8. Regras para comunicação de marketing

- enviar somente para clientes com consentimento de marketing ativo;
- registrar quando e onde o consentimento foi obtido;
- respeitar imediatamente `SAIR`, `PARAR`, `CANCELAR MARKETING` ou pedido equivalente;
- nunca comprar listas de números;
- não importar contatos sem consentimento;
- limitar frequência de campanhas;
- não segmentar campanhas usando dados de saúde, sintomas ou informações clínicas;
- usar templates aprovados quando a empresa iniciar uma conversa fora da janela permitida.

## 9. Cloud API — credenciais necessárias

Na etapa de integração precisaremos obter, na conta Meta da profissional:

- Meta App ID;
- Meta App Secret;
- WhatsApp Business Account ID (WABA ID);
- Phone Number ID;
- token de acesso adequado para produção;
- webhook verify token gerado por nós;
- URL HTTPS do webhook Supabase.

Nunca colocar token ou App Secret no JavaScript público ou no GitHub.

## 10. Webhook

O endpoint `whatsapp-webhook` deverá receber:

- novas mensagens;
- status `sent`;
- status `delivered`;
- status `read`;
- falhas;
- dados necessários para atualizar o histórico de conversa.

O endpoint público de webhook não terá JWT do Supabase, mas validará a verificação/assinatura exigida pela Meta antes de processar dados.

## 11. Consentimento no site

Adicionar checkboxes separados:

### Operacional

> Aceito receber pelo WhatsApp mensagens relacionadas ao meu agendamento, como confirmação, lembretes, remarcação e cancelamento.

### Marketing — opcional

> Quero receber pelo WhatsApp novidades, horários disponíveis, condições de pacotes e comunicações promocionais da Carla Almeida Lira.

O checkbox de marketing não pode ser obrigatório para realizar um agendamento.
