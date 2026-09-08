const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarEstadoPaquete,
  determinarEstadoEncomienda,
  ventaTodaNoEntregada
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

test('ventaTodaNoEntregada: solo true cuando hay paquetes y todos quedaron Devuelto', () => {
  assert.equal(ventaTodaNoEntregada([]), false);
  assert.equal(ventaTodaNoEntregada(null), false);
  assert.equal(ventaTodaNoEntregada([{ estado: 'Devuelto' }]), true);
  assert.equal(ventaTodaNoEntregada([{ estado: 'Devuelto' }, { estado: 'devuelto' }]), true);
  assert.equal(ventaTodaNoEntregada([{ estado: 'Entregado' }, { estado: 'Devuelto' }]), false);
  assert.equal(ventaTodaNoEntregada([{ estado: 'Entregado' }, { estado: 'Entregado' }]), false);
  assert.equal(ventaTodaNoEntregada([{ estado: 'En sede de destino' }, { estado: 'Devuelto' }]), false);
});

