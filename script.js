/* =============================================
   MENU MOBILE — toggle com acessibilidade
   ============================================= */

const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('active');
    toggle.setAttribute('aria-expanded', isOpen);
    toggle.textContent = isOpen ? '✕' : '☰';
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    });
  });
}

/* Mantém a ação principal antes das dúvidas e da localização. */
const bookingSection = document.getElementById('agendar');
const faqSection = document.getElementById('faq');
if (bookingSection && faqSection) faqSection.before(bookingSection);

/* =============================================
   DÚVIDAS FREQUENTES — acordeão com movimento
   ============================================= */

const faqItems = Array.from(document.querySelectorAll('.faq-item'));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setFaqIcon(item, isOpen) {
  const icon = item.querySelector('.faq-icon');
  if (icon) icon.textContent = isOpen ? '−' : '+';
}

function closeFaq(item, animate = true) {
  const answer = item.querySelector('.faq-answer');
  if (!answer || !item.open) return;

  setFaqIcon(item, false);
  if (!animate || reduceMotion || !answer.animate) {
    item.open = false;
    answer.style.height = '';
    answer.style.opacity = '';
    item.style.transform = '';
    return;
  }

  const height = answer.scrollHeight;
  const contentAnimation = answer.animate(
    [
      { height: `${height}px`, opacity: 1, transform: 'translateY(0)' },
      { height: '0px', opacity: 0, transform: 'translateY(-8px)' },
    ],
    { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  );
  item.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(0.985)' }],
    { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
  );
  contentAnimation.onfinish = () => {
    item.open = false;
    answer.style.height = '';
    answer.style.opacity = '';
  };
}

function openFaq(item) {
  const answer = item.querySelector('.faq-answer');
  if (!answer) return;

  faqItems.forEach(other => {
    if (other !== item && other.open) closeFaq(other);
  });

  item.open = true;
  setFaqIcon(item, true);
  if (reduceMotion || !answer.animate) return;

  const height = answer.scrollHeight;
  answer.animate(
    [
      { height: '0px', opacity: 0, transform: 'translateY(-8px)' },
      { height: `${height}px`, opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  );
  item.animate(
    [
      { transform: 'scale(0.985)' },
      { transform: 'scale(1.008)', offset: 0.72 },
      { transform: 'scale(1)' },
    ],
    { duration: 430, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
  );
}

faqItems.forEach(item => {
  const summary = item.querySelector('summary');
  summary?.addEventListener('click', event => {
    event.preventDefault();
    if (item.open) closeFaq(item);
    else openFaq(item);
  });
});

/* =============================================
   AGENDAMENTO REAL — Supabase + fallback WhatsApp
   ============================================= */

const form = document.getElementById('form-agendamento');

if (form) {
  const FUNCTIONS_BASE = 'https://nmjssxbneqepqonvcvoe.supabase.co/functions/v1';
  const BUSINESS_SLUG = 'massoterapia-spa';
  const NUMERO_WHATSAPP = '5519993297780';

  const SERVICE_SLUGS = {
    'Massagem Sueca': 'massagem-sueca',
    'Massagem Terapêutica': 'massagem-terapeutica',
    'Pedras Quentes': 'pedras-quentes',
    'Ventosoterapia': 'ventosoterapia',
    'Drenagem Linfática': 'drenagem-linfatica',
    'Miracle Face': 'miracle-face',
  };

  const nomeEl = document.getElementById('nome');
  const dataEl = document.getElementById('data');
  const horarioEl = document.getElementById('horario');
  const obsEl = document.getElementById('observacao');
  const btn = document.getElementById('btn-agendar');
  let selectedPlan = '';

  function formatarData(dataISO) {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function setMinDate() {
    if (!dataEl) return;
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    dataEl.min = `${ano}-${mes}-${dia}`;
  }

  function injectEnhancedFields() {
    if (!document.getElementById('selected-plan')) {
      form.insertAdjacentHTML('afterbegin', '<p id="selected-plan" class="selected-plan" role="status" aria-live="polite" hidden></p>');
    }

    const nomeGroup = nomeEl?.closest('.form-group');
    if (nomeGroup && !document.getElementById('telefone')) {
      nomeGroup.insertAdjacentHTML('afterend', `
        <div class="form-row booking-contact-row">
          <div class="form-group">
            <label class="form-label" for="telefone">WhatsApp</label>
            <input class="form-input" type="tel" id="telefone" name="telefone" placeholder="(19) 99999-9999" autocomplete="tel" inputmode="tel" aria-describedby="erro-telefone" required />
            <span class="form-error" id="erro-telefone">Informe um WhatsApp válido.</span>
          </div>
          <div class="form-group">
            <label class="form-label" for="email">E-mail <span class="form-label-opt">(opcional)</span></label>
            <input class="form-input" type="email" id="email" name="email" placeholder="voce@exemplo.com" autocomplete="email" aria-describedby="erro-email" />
            <span class="form-error" id="erro-email">Informe um e-mail válido.</span>
          </div>
        </div>
      `);
    }

    const dateRow = dataEl?.closest('.form-row');
    if (dateRow && !document.getElementById('location-spa')) {
      dateRow.insertAdjacentHTML('beforebegin', `
        <div class="form-group booking-location-group">
          <label class="form-label">Onde deseja o atendimento?</label>
          <div class="booking-location-options" role="radiogroup" aria-label="Local do atendimento">
            <label class="booking-choice"><input type="radio" id="location-spa" name="location_type" value="spa" checked /> <span>Spa Carla Lira</span></label>
            <label class="booking-choice"><input type="radio" name="location_type" value="home_care" /> <span>Na minha residência</span></label>
          </div>
          <div class="form-row booking-home-fields" id="home-care-fields" hidden>
            <div class="form-group">
              <label class="form-label" for="cidade">Cidade</label>
              <input class="form-input" type="text" id="cidade" name="cidade" placeholder="Sua cidade" autocomplete="address-level2" aria-describedby="erro-cidade" />
              <span class="form-error" id="erro-cidade">Informe a cidade.</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="bairro">Bairro</label>
              <input class="form-input" type="text" id="bairro" name="bairro" placeholder="Seu bairro" autocomplete="address-level3" aria-describedby="erro-bairro" />
              <span class="form-error" id="erro-bairro">Informe o bairro.</span>
            </div>
          </div>
        </div>
      `);
    }

    if (obsEl) {
      obsEl.placeholder = 'Informação útil para organizar o atendimento (opcional). Evite inserir dados de saúde sensíveis.';
      const obsGroup = obsEl.closest('.form-group');
      if (obsGroup && !document.getElementById('consent-service')) {
        obsGroup.insertAdjacentHTML('afterend', `
          <div class="form-group booking-consents">
            <label class="booking-consent">
              <input type="checkbox" id="consent-service" required />
              <span>Aceito receber mensagens pelo WhatsApp relacionadas ao meu agendamento.</span>
            </label>
            <label class="booking-consent">
              <input type="checkbox" id="consent-marketing" />
              <span>Quero receber novidades, horários disponíveis e promoções pelo WhatsApp. <strong>Opcional.</strong></span>
            </label>
            <span class="form-error" id="erro-consentimento">Autorize as mensagens necessárias para o agendamento.</span>
          </div>
        `);
      }
    }

    if (btn) {
      const text = btn.querySelector('.btn-texto');
      if (text) text.textContent = 'Confirmar agendamento';
      if (!document.getElementById('booking-feedback')) {
        btn.insertAdjacentHTML('afterend', '<div id="booking-feedback" class="booking-feedback" role="status" aria-live="polite"></div>');
      }
    }

    const intro = document.querySelector('.agendamento-intro > p:not(.eyebrow)');
    if (intro) {
      intro.textContent = 'Escolha o serviço, local, data e horário. Seu pedido será registrado com segurança e a confirmação será enviada pelo WhatsApp.';
    }

    if (horarioEl) {
      horarioEl.innerHTML = '<option value="">Escolha o serviço e a data</option>';
      horarioEl.disabled = true;
    }

    const descriptions = {
      nome: 'erro-nome',
      data: 'erro-data',
      horario: 'erro-horario',
      'consent-service': 'erro-consentimento',
    };
    Object.entries(descriptions).forEach(([id, errorId]) => {
      document.getElementById(id)?.setAttribute('aria-describedby', errorId);
    });
    form.querySelector('.servico-grid')?.setAttribute('aria-describedby', 'erro-servico');
  }

  function feedback(message, type = 'info') {
    const el = document.getElementById('booking-feedback');
    if (!el) return;
    el.className = `booking-feedback booking-feedback-${type}`;
    el.textContent = message;
  }

  function clearFieldError(id) {
    const input = document.getElementById(id);
    const error = document.getElementById(`erro-${id}`);
    input?.classList.remove('input-error');
    input?.removeAttribute('aria-invalid');
    error?.classList.remove('visible');
  }

  function showFieldError(id) {
    const input = document.getElementById(id);
    const error = document.getElementById(`erro-${id}`);
    input?.classList.add('input-error');
    input?.setAttribute('aria-invalid', 'true');
    error?.classList.add('visible');
  }

  function selectedService() {
    const el = form.querySelector('input[name="servico"]:checked');
    if (!el) return null;
    return { name: el.value, slug: SERVICE_SLUGS[el.value] || '' };
  }

  function selectedLocation() {
    return form.querySelector('input[name="location_type"]:checked')?.value || 'spa';
  }

  async function loadAvailability({ updateFeedback = true } = {}) {
    const service = selectedService();
    const date = dataEl?.value || '';
    if (!horarioEl) return;

    if (!service?.slug || !date) {
      horarioEl.disabled = true;
      horarioEl.innerHTML = '<option value="">Escolha o serviço e a data</option>';
      return;
    }

    horarioEl.disabled = true;
    horarioEl.innerHTML = '<option value="">Carregando horários...</option>';
    if (updateFeedback) feedback('Consultando a agenda...', 'info');

    try {
      const response = await fetch(`${FUNCTIONS_BASE}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_slug: BUSINESS_SLUG, date, service_slug: service.slug }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao consultar horários.');

      horarioEl.innerHTML = '<option value="">Selecione</option>';
      result.slots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot.time;
        option.textContent = slot.time;
        horarioEl.appendChild(option);
      });
      horarioEl.disabled = result.slots.length === 0;

      if (result.slots.length) {
        if (updateFeedback) feedback(`${result.slots.length} horário(s) disponível(is) para ${formatarData(date)}.`, 'success');
      } else {
        horarioEl.innerHTML = '<option value="">Sem horários disponíveis</option>';
        if (updateFeedback) feedback('Não há horários disponíveis nessa data. Escolha outro dia.', 'warning');
      }
    } catch (error) {
      console.error('availability_frontend_error', error);
      horarioEl.innerHTML = '<option value="">Não foi possível carregar</option>';
      horarioEl.disabled = true;
      if (updateFeedback) feedback('Não foi possível consultar a agenda agora. Você ainda pode falar com a Carla pelo WhatsApp.', 'error');
    }
  }

  function configureLocationFields() {
    const homeFields = document.getElementById('home-care-fields');
    const isHome = selectedLocation() === 'home_care';
    if (homeFields) homeFields.hidden = !isHome;
    ['cidade', 'bairro'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.required = isHome;
      if (!isHome) clearFieldError(id);
    });
  }

  function validateForm() {
    let valid = true;
    let firstInvalid = null;
    const service = selectedService();
    const phone = document.getElementById('telefone')?.value || '';
    const email = document.getElementById('email')?.value.trim() || '';
    const consent = document.getElementById('consent-service');

    if (!service?.slug) {
      document.getElementById('erro-servico')?.classList.add('visible');
      form.querySelector('.servico-grid')?.setAttribute('aria-invalid', 'true');
      firstInvalid = form.querySelector('input[name="servico"]');
      valid = false;
    } else {
      document.getElementById('erro-servico')?.classList.remove('visible');
      form.querySelector('.servico-grid')?.removeAttribute('aria-invalid');
    }

    if (!nomeEl?.value.trim()) { showFieldError('nome'); firstInvalid ||= nomeEl; valid = false; } else clearFieldError('nome');
    if (phone.replace(/\D/g, '').length < 10) { showFieldError('telefone'); firstInvalid ||= document.getElementById('telefone'); valid = false; } else clearFieldError('telefone');
    if (email && !document.getElementById('email')?.checkValidity()) { showFieldError('email'); firstInvalid ||= document.getElementById('email'); valid = false; } else clearFieldError('email');
    if (!dataEl?.value) { showFieldError('data'); firstInvalid ||= dataEl; valid = false; } else clearFieldError('data');
    if (!horarioEl?.value) { showFieldError('horario'); firstInvalid ||= horarioEl; valid = false; } else clearFieldError('horario');

    if (selectedLocation() === 'home_care') {
      if (!document.getElementById('cidade')?.value.trim()) { showFieldError('cidade'); firstInvalid ||= document.getElementById('cidade'); valid = false; } else clearFieldError('cidade');
      if (!document.getElementById('bairro')?.value.trim()) { showFieldError('bairro'); firstInvalid ||= document.getElementById('bairro'); valid = false; } else clearFieldError('bairro');
    }

    const consentError = document.getElementById('erro-consentimento');
    if (!consent?.checked) {
      consentError?.classList.add('visible');
      consent?.setAttribute('aria-invalid', 'true');
      firstInvalid ||= consent;
      valid = false;
    } else {
      consentError?.classList.remove('visible');
      consent?.removeAttribute('aria-invalid');
    }

    if (!valid && firstInvalid) {
      firstInvalid.focus({ preventScroll: true });
      firstInvalid.closest('label, .form-group')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return valid;
  }

  function whatsappFallback(booking) {
    const message = [
      'Olá, Carla! Acabei de registrar um pedido de agendamento pelo seu site.',
      '',
      `*Serviço:* ${booking.service}`,
      `*Data:* ${formatarData(booking.date)}`,
      `*Horário:* ${booking.time}`,
      `*Código:* ${booking.id.slice(0, 8)}`,
    ].join('\n');
    return `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(message)}`;
  }

  injectEnhancedFields();
  setMinDate();
  configureLocationFields();

  document.querySelectorAll('.plan-select').forEach(link => {
    link.addEventListener('click', () => {
      selectedPlan = link.dataset.plan || '';
      const selectedPlanEl = document.getElementById('selected-plan');
      if (selectedPlanEl && selectedPlan) {
        selectedPlanEl.hidden = false;
        selectedPlanEl.textContent = `${selectedPlan} selecionado. Agora escolha a técnica, a data e o horário.`;
      }
    });
  });

  form.querySelectorAll('input[name="servico"]').forEach(el => el.addEventListener('change', () => {
    document.getElementById('erro-servico')?.classList.remove('visible');
    form.querySelector('.servico-grid')?.removeAttribute('aria-invalid');
    loadAvailability();
  }));
  dataEl?.addEventListener('change', loadAvailability);
  form.querySelectorAll('input[name="location_type"]').forEach(el => el.addEventListener('change', configureLocationFields));
  document.getElementById('consent-service')?.addEventListener('change', event => {
    if (event.target.checked) {
      event.target.removeAttribute('aria-invalid');
      document.getElementById('erro-consentimento')?.classList.remove('visible');
    }
  });

  ['nome', 'telefone', 'email', 'data', 'horario', 'cidade', 'bairro'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => clearFieldError(id));
    el?.addEventListener('change', () => clearFieldError(id));
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateForm()) {
      feedback('Revise os campos destacados para continuar.', 'error');
      return;
    }

    const service = selectedService();
    const locationType = selectedLocation();
    const textEl = btn?.querySelector('.btn-texto');
    const originalText = textEl?.textContent || 'Confirmar agendamento';

    if (btn) btn.disabled = true;
    if (textEl) textEl.textContent = 'Registrando...';
    feedback('Registrando seu pedido de agendamento...', 'info');

    try {
      const payload = {
        website: document.getElementById('website')?.value || '',
        business_slug: BUSINESS_SLUG,
        full_name: nomeEl.value.trim(),
        phone: document.getElementById('telefone').value,
        email: document.getElementById('email')?.value.trim() || null,
        service_slug: service.slug,
        date: dataEl.value,
        time: horarioEl.value,
        location_type: locationType,
        city: locationType === 'home_care' ? document.getElementById('cidade')?.value.trim() : null,
        neighborhood: locationType === 'home_care' ? document.getElementById('bairro')?.value.trim() : null,
        note: [selectedPlan ? `Interesse: ${selectedPlan}` : '', obsEl?.value.trim() || ''].filter(Boolean).join(' | ') || null,
        whatsapp_service_consent: document.getElementById('consent-service')?.checked === true,
        whatsapp_marketing_consent: document.getElementById('consent-marketing')?.checked === true,
      };

      const response = await fetch(`${FUNCTIONS_BASE}/create-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar o agendamento.');

      if (result.booking_token && result.appointment?.id) {
        sessionStorage.setItem(`booking_token_${result.appointment.id}`, result.booking_token);
      }

      const fallbackUrl = whatsappFallback(result.appointment);
      const feedbackEl = document.getElementById('booking-feedback');
      if (feedbackEl) {
        feedbackEl.className = 'booking-feedback booking-feedback-success';
        feedbackEl.setAttribute('tabindex', '-1');
        feedbackEl.innerHTML = `<strong>Agendamento recebido!</strong><br>Seu pedido foi registrado para <strong>${formatarData(result.appointment.date)} às ${result.appointment.time}</strong>. A Carla poderá confirmar os próximos detalhes pelo WhatsApp. <a href="${fallbackUrl}" target="_blank" rel="noopener">Abrir conversa no WhatsApp</a>.`;
        feedbackEl.focus({ preventScroll: true });
        feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      horarioEl.value = '';
      await loadAvailability({ updateFeedback: false });
    } catch (error) {
      console.error('booking_frontend_error', error);
      feedback(error.message || 'Não foi possível concluir o agendamento agora.', 'error');
      await loadAvailability({ updateFeedback: false });
    } finally {
      if (btn) btn.disabled = false;
      if (textEl) textEl.textContent = originalText;
    }
  });
}
