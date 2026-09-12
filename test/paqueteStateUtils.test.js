const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarEstadoPaquete,
  determinarEstadoEncomienda,
  normalizarEstadoPago,
  determinarEstadoPago
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

test('normalizarEstadoPago: normaliza y rechaza valores fuera del dominio', () => {
  assert.equal(normalizarEstadoPago('pagado'), 'Pagado');
  assert.equal(normalizarEstadoPago('PENDIENTE'), 'Pendiente');
  assert.equal(normalizarEstadoPago(undefined), 'Pendiente');
  assert.throws(() => normalizarEstadoPago('Pagado parcial'));
});

test('determinarEstadoPago: sin paquetes devuelve el estado actual', () => {
  assert.equal(determinarEstadoPago([], 'Pendiente'), 'Pendiente');
  assert.equal(determinarEstadoPago(null, 'Pagada'), 'Pagada');
});

test('determinarEstadoPago: Pago Inmediato (todos nacen Pagado) -> Pagada', () => {
  assert.equal(
    determinarEstadoPago([{ estadoPago: 'Pagado', estado: 'Por entregar' }, { estadoPago: 'Pagado', estado: 'Por entregar' }], 'Pendiente'),
    'Pagada'
  );
});

test('determinarEstadoPago: Contraentrega en curso -> se queda en el estado actual', () => {
  assert.equal(
    determinarEstadoPago([{ estadoPago: 'Pendiente', estado: 'Por entregar' }, { estadoPago: 'Pendiente', estado: 'En sede de destino' }], 'Pendiente'),
    'Pendiente'
  );
});

test('determinarEstadoPago: Contraentrega, todos Entregado -> Pagada', () => {
  assert.equal(
    determinarEstadoPago([{ estadoPago: 'Pagado', estado: 'Entregado' }, { estadoPago: 'Pagado', estado: 'Entregado' }], 'Pendiente'),
    'Pagada'
  );
});

test('determinarEstadoPago: Contraentrega, todos Devuelto -> Sin pago', () => {
  assert.equal(
    determinarEstadoPago([{ estadoPago: 'Pendiente', estado: 'Devuelto' }, { estadoPago: 'Pendiente', estado: 'Devuelto' }], 'Pendiente'),
    'Sin pago'
  );
});

test('determinarEstadoPago: Contraentrega mixto (uno pagado, uno devuelto) -> Pago parcial', () => {
  assert.equal(
    determinarEstadoPago([{ estadoPago: 'Pagado', estado: 'Entregado' }, { estadoPago: 'Pendiente', estado: 'Devuelto' }], 'Pendiente'),
    'Pago parcial'
  );
});

