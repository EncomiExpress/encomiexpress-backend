// Un conductor sin categorías registradas no se bloquea (falta de dato, no vencimiento).
// Con categorías registradas, basta con que UNA esté vigente — una licencia real
// puede tener varias categorías con vencimientos distintos (ver Conductor.categoriasLicencia).
const tieneLicenciaVigente = (categoriasLicencia) => {
  if (!categoriasLicencia || categoriasLicencia.length === 0) return true;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return categoriasLicencia.some((c) => {
    if (!c.vencimiento) return false;
    const venc = new Date(c.vencimiento);
    venc.setHours(0, 0, 0, 0);
    return venc >= hoy;
  });
};

module.exports = { tieneLicenciaVigente };
