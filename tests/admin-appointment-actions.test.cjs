const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('admin.js', 'utf8');
const functionSource = source.match(/function appointmentActions\(a, client\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(functionSource, 'appointmentActions function should exist');

const context = {
  formatDateTime: value => `formatted ${value}`,
  escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#039;'),
};
vm.runInNewContext(`${functionSource}; this.appointmentActions = appointmentActions;`, context);

test('appointment row actions identify their client and scheduled time', () => {
  const appointment = { id: 'a-1', starts_at: '2030-02-03T10:00:00Z', status: 'pending' };
  const client = { full_name: 'Ana <Silva>' };
  const pendingHtml = context.appointmentActions(appointment, client);
  for (const [action, label] of [['confirm', 'Confirmar'], ['cancel', 'Cancelar']]) {
    assert.match(pendingHtml, new RegExp(`aria-label="${label} agendamento de Ana &lt;Silva&gt; em formatted 2030-02-03T10:00:00Z"`), `${action} action should include client and appointment time`);
  }
  const confirmedHtml = context.appointmentActions({ ...appointment, status: 'confirmed' }, client);
  for (const [action, label] of [['complete', 'Concluir'], ['cancel', 'Cancelar']]) {
    assert.match(confirmedHtml, new RegExp(`aria-label="${label} agendamento de Ana &lt;Silva&gt; em formatted 2030-02-03T10:00:00Z"`), `${action} action should include client and appointment time`);
  }
});
