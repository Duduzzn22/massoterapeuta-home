// Run from the repo root: node --experimental-strip-types --test tests/*.test.*
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WHATSAPP_CONFIRMATION_MAX_AGE_MS,
  whatsappConfirmationSkipReason,
} from '../supabase/functions/_shared/notification-rules.ts';

const now = new Date('2026-10-23T12:00:00Z');
const hoursFromNow = h => new Date(now.getTime() + h * 3_600_000).toISOString();

const freshJob = { created_at: hoursFromNow(-1) };
const futureAppointment = { status: 'pending', starts_at: hoursFromNow(48) };

test('timely confirmation is sent', () => {
  assert.equal(whatsappConfirmationSkipReason(freshJob, futureAppointment, now), null);
  assert.equal(whatsappConfirmationSkipReason(freshJob, { ...futureAppointment, status: 'confirmed' }, now), null);
});

test('missing appointment is skipped', () => {
  assert.equal(whatsappConfirmationSkipReason(freshJob, null, now), 'appointment_missing');
});

test('inactive appointments are skipped', () => {
  for (const status of ['cancelled', 'completed', 'no_show']) {
    assert.equal(
      whatsappConfirmationSkipReason(freshJob, { ...futureAppointment, status }, now),
      `appointment_${status}`,
    );
  }
});

test('past or already-started sessions are skipped', () => {
  assert.equal(
    whatsappConfirmationSkipReason(freshJob, { ...futureAppointment, starts_at: hoursFromNow(-2) }, now),
    'appointment_already_started',
  );
  assert.equal(
    whatsappConfirmationSkipReason(freshJob, { ...futureAppointment, starts_at: now.toISOString() }, now),
    'appointment_already_started',
  );
});

test('confirmations queued longer than the window are skipped', () => {
  const windowHours = WHATSAPP_CONFIRMATION_MAX_AGE_MS / 3_600_000;
  assert.equal(windowHours, 24);
  assert.equal(
    whatsappConfirmationSkipReason({ created_at: hoursFromNow(-(windowHours + 1)) }, futureAppointment, now),
    'confirmation_window_expired',
  );
  assert.equal(
    whatsappConfirmationSkipReason({ created_at: hoursFromNow(-(windowHours - 1)) }, futureAppointment, now),
    null,
  );
});

test('jobs without a valid created_at are treated as stale', () => {
  assert.equal(whatsappConfirmationSkipReason({}, futureAppointment, now), 'confirmation_window_expired');
});
