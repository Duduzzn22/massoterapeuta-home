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

  // Fecha o menu ao clicar em um link
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    });
  });
}

/* =============================================
   DATA MÍNIMA — não permite datas passadas
   ============================================= */

const inputData = document.getElementById('data');
if (inputData) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  inputData.min = `${ano}-${mes}-${dia}`;
}

/* =============================================
   FORMULÁRIO DE AGENDAMENTO — envio via WhatsApp
   ============================================= */

const form = document.getElementById('form-agendamento');

if (form) {
  const NUMERO_WHATSAPP = '5519993297780'; // Número da Carla (com DDI 55)

  // Formata data de YYYY-MM-DD para DD/MM/YYYY
  function formatarData(dataISO) {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  // Mostra erro num campo
  function mostrarErro(idErro, inputEl) {
    const erroEl = document.getElementById(idErro);
    if (erroEl) erroEl.classList.add('visible');
    if (inputEl) inputEl.classList.add('input-error');
  }

  // Esconde erro num campo
  function esconderErro(idErro, inputEl) {
    const erroEl = document.getElementById(idErro);
    if (erroEl) erroEl.classList.remove('visible');
    if (inputEl) {
      inputEl.classList.remove('input-error');
      if (inputEl.value) inputEl.classList.add('input-ok');
    }
  }

  // Validação em tempo real nos inputs
  ['nome', 'data', 'horario'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (el.value.trim()) {
        esconderErro(`erro-${id}`, el);
      }
    });
    el.addEventListener('change', () => {
      if (el.value.trim()) {
        esconderErro(`erro-${id}`, el);
      }
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    // --- Coleta de valores ---
    const servicoEl = form.querySelector('input[name="servico"]:checked');
    const nomeEl    = document.getElementById('nome');
    const dataEl    = document.getElementById('data');
    const horarioEl = document.getElementById('horario');
    const obsEl     = document.getElementById('observacao');

    const servico  = servicoEl ? servicoEl.value : '';
    const nome     = nomeEl    ? nomeEl.value.trim()    : '';
    const data     = dataEl    ? dataEl.value            : '';
    const horario  = horarioEl ? horarioEl.value         : '';
    const obs      = obsEl     ? obsEl.value.trim()      : '';

    // --- Validação ---
    let valido = true;

    if (!servico) {
      mostrarErro('erro-servico', null);
      valido = false;
    } else {
      const erroServico = document.getElementById('erro-servico');
      if (erroServico) erroServico.classList.remove('visible');
    }

    if (!nome) {
      mostrarErro('erro-nome', nomeEl);
      valido = false;
    } else {
      esconderErro('erro-nome', nomeEl);
    }

    if (!data) {
      mostrarErro('erro-data', dataEl);
      valido = false;
    } else {
      esconderErro('erro-data', dataEl);
    }

    if (!horario) {
      mostrarErro('erro-horario', horarioEl);
      valido = false;
    } else {
      esconderErro('erro-horario', horarioEl);
    }

    if (!valido) return;

    // --- Monta a mensagem para o WhatsApp ---
    const dataFormatada = formatarData(data);

    let mensagem =
      `Olá, Carla! Gostaria de agendar uma sessão.\n\n` +
      `*Serviço:* ${servico}\n` +
      `*Nome:* ${nome}\n` +
      `*Data preferida:* ${dataFormatada}\n` +
      `*Horário:* ${horario}`;

    if (obs) {
      mensagem += `\n\n*Observações:* ${obs}`;
    }

    mensagem += `\n\nAguardo seu retorno!`;

    // --- Abre o WhatsApp ---
    const urlWhatsApp = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
    window.open(urlWhatsApp, '_blank', 'noopener');

    // --- Feedback visual no botão ---
    const btn = document.getElementById('btn-agendar');
    if (btn) {
      const textoOriginal = btn.querySelector('.btn-texto').textContent;
      btn.querySelector('.btn-texto').textContent = 'Abrindo WhatsApp...';
      btn.disabled = true;

      setTimeout(() => {
        btn.querySelector('.btn-texto').textContent = textoOriginal;
        btn.disabled = false;
      }, 3000);
    }
  });
}