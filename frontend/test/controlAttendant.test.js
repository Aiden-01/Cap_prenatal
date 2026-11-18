import test from 'node:test';
import assert from 'node:assert/strict';
import { controlAttendantName, controlAttendantRole, formatControlAttendant } from '../src/utils/controlAttendant.js';

test('historial y plan de parto no infieren identidad/cargo desde el texto legado', () => {
  const old = { nombre_cargo_atiende: 'Texto histórico completo - cargo no desglosado' };
  assert.equal(controlAttendantName(old), '');
  assert.equal(controlAttendantRole(old), '');
  assert.equal(formatControlAttendant(old), old.nombre_cargo_atiende);
});

test('datos nuevos conservan nombre libre y snapshot, sin tomar perfil del capturista ni catálogo vigente', () => {
  const row = { nombre_atiende: 'Nombre declarado', cargo_atiende_snapshot: { id: 2, nombre: 'Cargo al atender', codigo: null }, cargo_nombre: 'Cargo actual distinto', nombre_cargo_atiende: 'Anterior' };
  assert.equal(controlAttendantName(row), 'Nombre declarado');
  assert.equal(controlAttendantRole(row), 'Cargo al atender');
  assert.equal(formatControlAttendant(row), 'Nombre declarado · Cargo al atender');
});
