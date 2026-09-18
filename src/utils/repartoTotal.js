// Reparto del total de una venta entre sus paquetes (Paquete.valorCobro).
//
// Contexto: la venta guarda UN solo total (EncomiendaVenta.total). Lo calcula el
// frontend en el wizard de Ventas (ventaValidation.calcularValorServicio):
//   total = tarifa base del destino + Σ costo por peso + Σ póliza + n × tarifa por paquete
// y se puede editar a mano antes de guardar. Pero el distribuidor entrega -- y en
// Contraentrega cobra -- paquete por paquete, así que cada paquete necesita SU parte
// para poder mostrarle lo que le falta por cobrar a medida que entrega.
//
// Regla: el valor "propio" de un paquete es lo que le corresponde por sí solo (su costo
// por peso + su póliza + la tarifa por paquete) más una parte IGUAL de la tarifa base
// del destino (es un cargo por envío, no por paquete). Como el total pudo haberse
// editado a mano, esos valores propios se usan solo como PESOS RELATIVOS: el reparto se
// escala para que sume EXACTAMENTE el total de la venta. Con el total sin editar
// coincide con la fórmula del wizard; editado, la diferencia se prorratea.
//
// El cálculo del peso/costo replica el del frontend (ventaValidation.js:
// calcularPesoEfectivo / calcularCostoPeso). Si algún día divergen, lo único que cambia
// son las proporciones entre paquetes: la suma sigue siendo el total.

// Mismo factor que FACTOR_VOLUMETRICO del frontend: alto×ancho×profundidad en METROS × 400.
const FACTOR_VOLUMETRICO = 400;

// Los DECIMAL de Postgres llegan como String ("25.00") y el body puede traer comas.
const aNumero = (valor) => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const numero = parseFloat(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
};

// Se cobra por el mayor entre el peso real y el volumétrico (dimensiones en cm).
const pesoEfectivo = ({ peso, alto, ancho, profundidad }) => {
  const real = aNumero(peso);
  const volumetrico = (aNumero(alto) / 100) * (aNumero(ancho) / 100) * (aNumero(profundidad) / 100) * FACTOR_VOLUMETRICO;
  return Math.max(real, volumetrico);
};

const valorPropio = (paquete, tarifas) => {
  const tarifaKg = paquete.tipoCarga === 'hierro' ? tarifas.tarifaPorKgHierro : tarifas.tarifaPorKgNormal;
  return pesoEfectivo(paquete) * aNumero(tarifaKg) + aNumero(paquete.valorPoliza) + aNumero(tarifas.tarifaPorPaquete);
};

// Devuelve un arreglo de pesos colombianos ENTEROS, en el mismo orden que `paquetes`,
// cuya suma es exactamente Math.round(total). Sin tarifas (o todas en 0) reparte a
// partes iguales.
//
// paquetes: [{ peso, alto, ancho, profundidad, tipoCarga, valorPoliza }]
// tarifas:  { tarifaBase, tarifaPorKgHierro, tarifaPorKgNormal, tarifaPorPaquete }
const repartirTotalEntrePaquetes = (total, paquetes, tarifas = {}) => {
  const cantidad = paquetes.length;
  if (cantidad === 0) return [];

  const totalPesos = Math.max(0, Math.round(aNumero(total)));
  const parteBase = aNumero(tarifas.tarifaBase) / cantidad;
  const pesosRelativos = paquetes.map((paquete) => Math.max(0, valorPropio(paquete, tarifas) + parteBase));
  const sumaPesos = pesosRelativos.reduce((suma, valor) => suma + valor, 0);

  const cuotas = pesosRelativos.map((valor) => (sumaPesos > 0 ? (totalPesos * valor) / sumaPesos : totalPesos / cantidad));
  const valores = cuotas.map(Math.floor);

  // Los pesos sueltos que deja el redondeo hacia abajo se reparten de a uno entre los
  // paquetes con mayor parte decimal (desempate: el primero), para que la suma cuadre.
  let sobrante = totalPesos - valores.reduce((suma, valor) => suma + valor, 0);
  const porFraccion = cuotas
    .map((cuota, indice) => ({ indice, fraccion: cuota - valores[indice] }))
    .sort((a, b) => b.fraccion - a.fraccion || a.indice - b.indice);
  for (let k = 0; sobrante > 0; k = (k + 1) % cantidad) {
    valores[porFraccion[k].indice] += 1;
    sobrante -= 1;
  }

  return valores;
};

module.exports = { repartirTotalEntrePaquetes };
