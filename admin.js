import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const SUPABASE_URL = 'https://nmjssxbneqepqonvcvoe.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jBSPgV5oVlPlHVNRNc-ZlA_yV1t30od';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const loginShell = document.getElementById('login-shell');
const dashboardShell = document.getElementById('dashboard-shell');
const loginForm = document.getElementById('login-form');
const loginFeedback = document.getElementById('login-feedback');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const refreshButton = document.getElementById('refresh-button');
const globalFeedback = document.getElementById('global-feedback');
const viewTitle = document.getElementById('view-title');
const clientSearch = document.getElementById('client-search');

let state = {
  profile: null,
  appointments: [],
  clients: [],
  quickReplies: [],
  messages: [],
  campaigns: [],
};

const STATUS_LABELS = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

const CRM_LABELS = {
  new_lead: 'Novo lead',
  waiting_response: 'Aguardando resposta',
  waiting_confirmation: 'Aguardando confirmação',
  scheduled: 'Agendado',
  attended: 'Atendido',
  follow_up: 'Retorno',
  recurring: 'Recorrente',
  cancelled: 'Cancelado',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setGlobalFeedback(message = '') {
  globalFeedback.textContent = message;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value || '—';
}

function localDateKey(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function showLogin(message = '') {
  loginShell.hidden = false;
  dashboardShell.hidden = true;
  loginFeedback.textContent = message;
}

function showDashboard() {
  loginShell.hidden = true;
  dashboardShell.hidden = false;
  document.getElementById('admin-user-name').textContent = state.profile?.full_name || 'Administrador';
}

async function ensureAdmin(session) {
  if (!session?.user) return false;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, active')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile || !profile.active || profile.role !== 'admin') {
    await supabase.auth.signOut();
    return false;
  }
  state.profile = profile;
  return true;
}

async function loadData() {
  setGlobalFeedback('');
  refreshButton.disabled = true;
  refreshButton.textContent = 'Atualizando...';

  try {
    const start = new Date();
    start.setDate(start.getDate() - 7);

    const [appointmentsResult, clientsResult, repliesResult, messagesResult, campaignsResult] = await Promise.all([
      supabase
        .from('appointments')
        .select('id,status,location_type,starts_at,ends_at,home_city,home_neighborhood,created_at,clients(id,full_name,phone_e164),services(id,name)')
        .gte('starts_at', start.toISOString())
        .order('starts_at', { ascending: true })
        .limit(250),
      supabase
        .from('clients')
        .select('id,full_name,phone_e164,email,city,neighborhood,crm_stage,last_contact_at,created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('quick_replies').select('id,shortcut,title,body,active').eq('active', true).order('shortcut'),
      supabase.from('whatsapp_messages').select('id,direction,status,body_preview,created_at,clients(full_name)').order('created_at', { ascending: false }).limit(30),
      supabase.from('campaigns').select('id,name,template_name,status,scheduled_for,created_at').order('created_at', { ascending: false }).limit(100),
    ]);

    for (const result of [appointmentsResult, clientsResult, repliesResult, messagesResult, campaignsResult]) {
      if (result.error) throw result.error;
    }

    state.appointments = appointmentsResult.data || [];
    state.clients = clientsResult.data || [];
    state.quickReplies = repliesResult.data || [];
    state.messages = messagesResult.data || [];
    state.campaigns = campaignsResult.data || [];

    renderAll();
  } catch (error) {
    console.error('admin_load_error', error);
    setGlobalFeedback('Não foi possível carregar os dados do painel. Verifique sua conexão e tente novamente.');
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Atualizar';
  }
}

function renderMetrics() {
  const today = localDateKey(new Date());
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const now = new Date();

  const todayCount = state.appointments.filter(a => localDateKey(a.starts_at) === today && !['cancelled', 'no_show'].includes(a.status)).length;
  const pendingCount = state.appointments.filter(a => a.status === 'pending').length;
  const weekCount = state.appointments.filter(a => {
    const date = new Date(a.starts_at);
    return date >= now && date <= weekEnd && !['cancelled', 'no_show'].includes(a.status);
  }).length;

  document.getElementById('metric-today').textContent = todayCount;
  document.getElementById('metric-pending').textContent = pendingCount;
  document.getElementById('metric-clients').textContent = state.clients.length;
  document.getElementById('metric-week').textContent = weekCount;
}

function appointmentActions(a) {
  if (a.status === 'pending') {
    return `<button class="row-action" data-appointment-action="confirm" data-id="${a.id}">Confirmar</button><button class="row-action danger" data-appointment-action="cancel" data-id="${a.id}">Cancelar</button>`;
  }
  if (a.status === 'confirmed') {
    return `<button class="row-action" data-appointment-action="complete" data-id="${a.id}">Concluir</button><button class="row-action danger" data-appointment-action="cancel" data-id="${a.id}">Cancelar</button>`;
  }
  return '—';
}

function renderAppointments() {
  const body = document.getElementById('appointments-body');
  if (!state.appointments.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum agendamento ainda.</td></tr>';
    return;
  }

  body.innerHTML = state.appointments.map(a => {
    const client = Array.isArray(a.clients) ? a.clients[0] : a.clients;
    const service = Array.isArray(a.services) ? a.services[0] : a.services;
    const location = a.location_type === 'home_care' ? `Home care${a.home_neighborhood ? ` · ${escapeHtml(a.home_neighborhood)}` : ''}` : 'Spa';
    return `<tr>
      <td>${formatDateTime(a.starts_at)}</td>
      <td><strong>${escapeHtml(client?.full_name || 'Cliente')}</strong><br><small>${escapeHtml(formatPhone(client?.phone_e164))}</small></td>
      <td>${escapeHtml(service?.name || '—')}</td>
      <td>${location}</td>
      <td><span class="status-pill status-${escapeHtml(a.status)}">${escapeHtml(STATUS_LABELS[a.status] || a.status)}</span></td>
      <td><div class="row-actions">${appointmentActions(a)}</div></td>
    </tr>`;
  }).join('');
}

function renderClients(filter = '') {
  const body = document.getElementById('clients-body');
  const query = filter.trim().toLowerCase();
  const clients = state.clients.filter(client => {
    if (!query) return true;
    return `${client.full_name} ${client.phone_e164} ${client.city || ''}`.toLowerCase().includes(query);
  });

  if (!clients.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum cliente encontrado.</td></tr>';
    return;
  }

  body.innerHTML = clients.map(client => `<tr>
    <td><strong>${escapeHtml(client.full_name)}</strong>${client.email ? `<br><small>${escapeHtml(client.email)}</small>` : ''}</td>
    <td>${escapeHtml(formatPhone(client.phone_e164))}</td>
    <td>${escapeHtml([client.neighborhood, client.city].filter(Boolean).join(' · ') || '—')}</td>
    <td><span class="crm-stage">${escapeHtml(CRM_LABELS[client.crm_stage] || client.crm_stage)}</span></td>
    <td>${client.last_contact_at ? formatDateTime(client.last_contact_at) : '—'}</td>
  </tr>`).join('');
}

function renderQuickReplies() {
  const list = document.getElementById('quick-replies-list');
  list.innerHTML = state.quickReplies.length
    ? state.quickReplies.map(reply => `<article class="quick-reply"><code>${escapeHtml(reply.shortcut)}</code><strong>${escapeHtml(reply.title)}</strong><p>${escapeHtml(reply.body)}</p></article>`).join('')
    : '<p class="empty-row">Nenhuma resposta rápida cadastrada.</p>';
}

function renderMessages() {
  const list = document.getElementById('messages-list');
  list.innerHTML = state.messages.length
    ? state.messages.map(message => {
        const client = Array.isArray(message.clients) ? message.clients[0] : message.clients;
        return `<article class="message-item ${escapeHtml(message.direction)}"><strong>${escapeHtml(client?.full_name || 'Contato')} · ${escapeHtml(message.direction === 'outbound' ? 'Enviada' : 'Recebida')}</strong><p>${escapeHtml(message.body_preview || 'Mensagem sem prévia')} · ${formatDateTime(message.created_at)}</p></article>`;
      }).join('')
    : '<p class="empty-row">A integração da Cloud API ainda não recebeu mensagens.</p>';
}

function renderCampaigns() {
  const body = document.getElementById('campaigns-body');
  body.innerHTML = state.campaigns.length
    ? state.campaigns.map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.template_name)}</td><td>${escapeHtml(c.status)}</td><td>${c.scheduled_for ? formatDateTime(c.scheduled_for) : '—'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-row">Nenhuma campanha criada.</td></tr>';
}

function renderAll() {
  renderMetrics();
  renderAppointments();
  renderClients(clientSearch?.value || '');
  renderQuickReplies();
  renderMessages();
  renderCampaigns();
}

async function updateAppointment(id, action) {
  const transitions = {
    confirm: { status: 'confirmed', crm: 'scheduled', event: 'appointment_confirmed' },
    complete: { status: 'completed', crm: 'attended', event: 'appointment_completed' },
    cancel: { status: 'cancelled', crm: 'cancelled', event: 'appointment_cancelled' },
  };
  const target = transitions[action];
  if (!target) return;

  const appointment = state.appointments.find(item => item.id === id);
  if (!appointment) return;

  setGlobalFeedback('');
  try {
    const patch = { status: target.status, updated_at: new Date().toISOString() };
    if (target.status === 'cancelled') patch.cancelled_at = new Date().toISOString();

    const { error: appointmentError } = await supabase.from('appointments').update(patch).eq('id', id);
    if (appointmentError) throw appointmentError;

    const client = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients;
    if (client?.id) {
      const { error: clientError } = await supabase.from('clients').update({ crm_stage: target.crm, updated_at: new Date().toISOString() }).eq('id', client.id);
      if (clientError) console.warn('client_crm_update_failed', clientError);
    }

    const { error: eventError } = await supabase.from('appointment_events').insert({ appointment_id: id, event_type: target.event, actor_user_id: state.profile.id, payload: { source: 'admin_panel' } });
    if (eventError) console.warn('appointment_event_insert_failed', eventError);

    await loadData();
  } catch (error) {
    console.error('appointment_update_error', error);
    setGlobalFeedback('Não foi possível atualizar esse agendamento.');
  }
}

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === view));
  const titles = { agenda: 'Agenda', clientes: 'Clientes', whatsapp: 'WhatsApp', campanhas: 'Campanhas' };
  viewTitle.textContent = titles[view] || 'Painel';
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginFeedback.textContent = '';
  loginButton.disabled = true;
  loginButton.textContent = 'Entrando...';
  try {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const allowed = await ensureAdmin(data.session);
    if (!allowed) {
      showLogin('Este usuário não possui permissão administrativa.');
      return;
    }
    showDashboard();
    await loadData();
  } catch (error) {
    console.error('admin_login_error', error);
    loginFeedback.textContent = 'E-mail ou senha inválidos, ou acesso ainda não autorizado.';
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Entrar';
  }
});

logoutButton.addEventListener('click', async () => {
  await supabase.auth.signOut();
  state.profile = null;
  showLogin();
});

refreshButton.addEventListener('click', loadData);
clientSearch?.addEventListener('input', event => renderClients(event.target.value));

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));

document.addEventListener('click', event => {
  const button = event.target.closest('[data-appointment-action]');
  if (button) updateAppointment(button.dataset.id, button.dataset.appointmentAction);
});

const { data: sessionData } = await supabase.auth.getSession();
if (sessionData.session) {
  try {
    const allowed = await ensureAdmin(sessionData.session);
    if (allowed) {
      showDashboard();
      await loadData();
    } else {
      showLogin('Seu acesso ainda não foi autorizado como administrador.');
    }
  } catch (error) {
    console.error('admin_boot_error', error);
    showLogin('Não foi possível validar seu acesso agora.');
  }
} else {
  showLogin();
}
