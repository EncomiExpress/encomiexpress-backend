// Un conductor sin categorías registradas no se bloquea (falta de dato, no vencimiento).
// Con categorías registradas, basta con que UNA esté vigente — una licencia real
// puede tener varias categorías con vencimientos distintos (ver Conductor.categoriasLicencia).
const tieneLicenciaVigente = (categoriasLicencia) => {
  if (!categoriasLicencia || categoriasLicencia.length === 0) return true;

  // "hoy" en hora Colombia explícita, no la del servidor (Render corre en UTC) — ver
  // el mismo fix y motivo en rutaService.js validarDocumentosVehiculo.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

  return categoriasLicencia.some((c) => {
    if (!c.vencimiento) return false;
    return String(c.vencimiento) > hoy;
  });
};

module.exports = { tieneLicenciaVigente };
