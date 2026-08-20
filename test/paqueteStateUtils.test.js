const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ESTADOS_PAQUETE,
  normalizarEstadoPaquete,
  determinarEstadoEncomienda
} = require('../src/services/paqueteStateUtils');

test('normaliza estados con espacios y mayúsculas', () => {
  assert.equal(normalizarEstadoPaquete('por entregar'), 'Por entregar');
  assert.equal(normalizarEstadoPaquete('ENTREGADO'), 'Entregado');
  assert.equal(normalizarEstadoPaquete('Devuelto'), 'Devuelto');
});

test('rechaza estados fuera del flujo soportado', () => {
  assert.throws(() => normalizarEstadoPaquete('Pendiente de revisión'));
});

test('determina el estado general de la encomienda a partir de los paquetes', () => {
  assert.equal(determinarEstadoEncomienda([{ estado: 'Entregado' }, { estado: 'Entregado' }], 'En Ruta'), 'Entregada');
  assert.equal(determinarEstadoEncomienda([{ estado: 'Entregado' }, { estado: 'Por entregar' }], 'En Ruta'), 'En Ruta');
  assert.equal(determinarEstadoEncomienda([], 'Programada'), 'Programada');
  assert.equal(determinarEstadoEncomienda([{ estado: 'Entregado' }, { estado: 'Devuelto' }], 'En Ruta'), 'Completada con novedades');
  assert.equal(determinarEstadoEncomienda([{ estado: 'Devuelto' }, { estado: 'Devuelto' }], 'En Ruta'), 'Completada con novedades');
});

test('expone la lista de estados soportados', () => {
  assert.deepEqual(ESTADOS_PAQUETE, ['Por entregar', 'Entregado', 'Devuelto']);
});
