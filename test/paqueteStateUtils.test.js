const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ESTADOS_PAQUETE,
  normalizarEstadoPaquete,
  construirHistorialEstado,
  determinarEstadoEncomienda
} = require('../src/services/paqueteStateUtils');

test('normaliza estados con espacios y mayúsculas', () => {
  assert.equal(normalizarEstadoPaquete('por entregar'), 'Por entregar');
  assert.equal(normalizarEstadoPaquete('EN REPARTO'), 'En reparto');
  assert.equal(normalizarEstadoPaquete('Entregado'), 'Entregado');
});

test('rechaza estados fuera del flujo soportado', () => {
  assert.throws(() => normalizarEstadoPaquete('Pendiente de revisión'));
});

test('agrega un registro de historial cuando cambia el estado', () => {
  const historial = construirHistorialEstado([], 'En reparto', 'Salió de bodega', 'Sin observación');
  assert.equal(historial.length, 1);
  assert.equal(historial[0].estado, 'En reparto');
  assert.match(historial[0].observacion, /Salió/);
});

test('determina el estado general de la encomienda a partir de los paquetes', () => {
  assert.equal(determinarEstadoEncomienda([{ estado: 'Entregado' }, { estado: 'Entregado' }]), 'Entregada');
  assert.equal(determinarEstadoEncomienda([{ estado: 'En reparto' }, { estado: 'Por entregar' }]), 'En Tránsito');
  assert.equal(determinarEstadoEncomienda([{ estado: 'Por entregar' }]), 'Programada');
});

test('expone la lista de estados soportados', () => {
  assert.deepEqual(ESTADOS_PAQUETE, ['Por entregar', 'En reparto', 'Entregado', 'No entregado', 'Devuelto a bodega']);
});
