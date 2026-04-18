
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');

  toggle.addEventListener('click', () => {
    nav.classList.toggle('active');
  });

const form = document.getElementById("form-agendamento");
const lista = document.getElementById("lista-agendamentos");

let agendamentos = JSON.parse(localStorage.getItem("agendamentos")) || [];

function salvarAgendamentos() {
  localStorage.setItem("agendamentos", JSON.stringify(agendamentos));
}

function renderizarAgendamentos() {
  lista.innerHTML = "";

  agendamentos.forEach((agendamento, index) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <strong>${agendamento.nome}</strong><br>
      Serviço: ${agendamento.servico}<br>
      Data: ${agendamento.data}<br>
      Horário: ${agendamento.horario}<br>
      <button onclick="removerAgendamento(${index})">Cancelar</button>
    `;
    lista.appendChild(item);
  });
}

function removerAgendamento(index) {
  agendamentos.splice(index, 1);
  salvarAgendamentos();
  renderizarAgendamentos();
}

form.addEventListener("submit", function(event) {
  event.preventDefault();

  const nome = document.getElementById("nome").value;
  const servico = document.getElementById("servico").value;
  const data = document.getElementById("data").value;
  const horario = document.getElementById("horario").value;

  const horarioOcupado = agendamentos.some(agendamento =>
    agendamento.data === data && agendamento.horario === horario
  );

  if (horarioOcupado) {
    alert("Esse horário já foi agendado.");
    return;
  }

  const novoAgendamento = {
    nome,
    servico,
    data,
    horario
  };

  agendamentos.push(novoAgendamento);
  salvarAgendamentos();
  renderizarAgendamentos();

  form.reset();
});

renderizarAgendamentos();