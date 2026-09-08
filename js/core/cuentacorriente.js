// Etapa 5 - LA PLATA EN EL TIEMPO: quién pagó, quién quedó debiendo, y cuánto
// se arrastra a la semana que viene.
//
// Todo acá es puro: recibe el historial y los pagos, devuelve números. La base
// de datos vive en js/datos/db.js.

export const ESTADOS = ['pendiente', 'enviada', 'pagada'];

/** Estado de una cuenta. Sin registro, está pendiente. */
export function estadoDe(pagos, listaId, claveCliente) {
  const p = (pagos || []).find((x) => x.listaId === listaId && x.claveCliente === claveCliente);
  return p ? p.estado : 'pendiente';
}

/** Lo que pagó de una cuenta. Si está pagada sin monto, pagó todo. */
export function pagadoDe(pagos, listaId, claveCliente, total) {
  const p = (pagos || []).find((x) => x.listaId === listaId && x.claveCliente === claveCliente);
  if (!p) return 0;
  if (p.estado === 'pagada') return p.monto === undefined || p.monto === null ? total : Number(p.monto);
  return Number(p.monto || 0);
}

/**
 * Cuánto debe cada cliente, mirando todas las listas anteriores a una fecha.
 * @param {Array} historial listas guardadas: { listaId, fecha, cuentas: [{claveCliente, nombre, total}] }
 * @param {Array} pagos
 * @param {string} hasta fecha ISO; se cuentan las listas ANTERIORES a esta
 */
export function saldosAnteriores(historial, pagos, hasta) {
  const saldos = {};
  for (const lista of historial || []) {
    if (hasta && lista.fecha >= hasta) continue;
    for (const cuenta of lista.cuentas || []) {
      const debe = cuenta.total - pagadoDe(pagos, lista.listaId, cuenta.claveCliente, cuenta.total);
      if (debe === 0) continue;
      if (!saldos[cuenta.claveCliente]) saldos[cuenta.claveCliente] = 0;
      saldos[cuenta.claveCliente] += debe;
    }
  }
  // Un saldo negativo (pagó de más) queda como está: es plata a favor.
  return saldos;
}

/**
 * La vista "quién me debe": una fila por cliente con deuda, ordenada por monto.
 */
export function quienMeDebe(historial, pagos) {
  const porCliente = new Map();

  for (const lista of historial || []) {
    for (const cuenta of lista.cuentas || []) {
      const pagado = pagadoDe(pagos, lista.listaId, cuenta.claveCliente, cuenta.total);
      const debe = cuenta.total - pagado;
      if (!porCliente.has(cuenta.claveCliente)) {
        porCliente.set(cuenta.claveCliente, {
          claveCliente: cuenta.claveCliente,
          nombre: cuenta.nombre,
          telMostrado: cuenta.telMostrado || '',
          telE164: cuenta.telE164 || '',
          debe: 0,
          listas: [],
        });
      }
      const c = porCliente.get(cuenta.claveCliente);
      c.nombre = cuenta.nombre || c.nombre;
      if (cuenta.telMostrado) c.telMostrado = cuenta.telMostrado;
      if (cuenta.telE164) c.telE164 = cuenta.telE164;
      c.debe += debe;
      if (debe !== 0) {
        c.listas.push({
          listaId: lista.listaId, fecha: lista.fecha, total: cuenta.total,
          pagado, debe, estado: estadoDe(pagos, lista.listaId, cuenta.claveCliente),
        });
      }
    }
  }

  const deudores = [...porCliente.values()]
    .filter((c) => c.debe !== 0)
    .sort((a, b) => b.debe - a.debe || a.nombre.localeCompare(b.nombre, 'es'));

  return {
    deudores,
    total: deudores.reduce((a, c) => a + (c.debe > 0 ? c.debe : 0), 0),
    aFavor: deudores.reduce((a, c) => a + (c.debe < 0 ? -c.debe : 0), 0),
    clientes: porCliente.size,
  };
}

/** Lo mínimo de una lista que hay que guardar para poder arrastrar saldos. */
export function resumenParaHistorial(lista, cobros) {
  return {
    fecha: lista.fecha,
    archivoOrigen: lista.archivoOrigen || '',
    totalPlata: cobros.total,
    cuentas: cobros.cuentas.map((c) => ({
      claveCliente: c.claveCliente,
      nombre: c.nombre,
      telMostrado: c.telMostrado,
      telE164: c.telE164,
      total: c.total,
      lineas: c.lineas.map((l) => ({ etiqueta: l.etiqueta, importe: l.importe })),
    })),
  };
}
