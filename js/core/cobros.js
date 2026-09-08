// Informe C - COBROS: la cuenta de cada cliente, lista para pegar en WhatsApp.
//
// Formato, tal como lo mandás vos:
//
//   Hola! Paso cuenta de la entrega de ayer
//   Papa 2350
//   Mandarina 2365
//   ...
//   $39.865, chequear cuenta antes de transferir
//   Alias: tu.alias
//
// Los importes de cada línea van pelados (sin $ ni puntos) y el total va con $
// y punto de miles. El total SIEMPRE se calcula acá: nunca se escribe a mano.

import { moneda, telE164, sinAcentos, limpiar } from './formato.js';

export const PLANTILLAS = {
  saludo: 'Hola! Paso cuenta de la entrega de ayer',
  cierre: 'chequear cuenta antes de transferir',
  aliasTransferencia: '',
  etiquetaSaldo: 'Saldo anterior',
};

/** Clave con la que se recuerda el alias de un producto entre semanas. */
export function claveAlias(nombreCorto) {
  return sinAcentos(limpiar(nombreCorto)).toLowerCase();
}

/** Alias sugerido la primera vez: la primera palabra del nombre corto. */
export function aliasSugerido(nombreCorto) {
  const primera = limpiar(nombreCorto).split(' ')[0] || '';
  return primera.charAt(0).toUpperCase() + primera.slice(1);
}

/** Los productos de un pedido que todavía no tienen alias confirmado. */
export function productosSinAlias(lista, alias = {}) {
  const vistos = new Map();
  for (const p of lista.pedidos) {
    for (const item of p.items) {
      const k = claveAlias(item.nombreCorto);
      if (alias[k] || vistos.has(k)) continue;
      vistos.set(k, { clave: k, nombreCorto: item.nombreCorto, sugerido: aliasSugerido(item.nombreCorto) });
    }
  }
  return [...vistos.values()];
}

/**
 * Arma la cuenta de un pedido.
 * @param {object} pedido
 * @param {object} opciones { alias, plantillas, saldoAnterior }
 */
export function armarCuenta(pedido, opciones = {}) {
  const alias = opciones.alias || {};
  const p = { ...PLANTILLAS, ...(opciones.plantillas || {}) };
  const saldoAnterior = Number(opciones.saldoAnterior || 0);

  const lineas = [];
  if (saldoAnterior > 0) {
    lineas.push({ etiqueta: p.etiquetaSaldo, importe: saldoAnterior, tipo: 'saldo' });
  }
  for (const item of pedido.items) {
    lineas.push({
      etiqueta: alias[claveAlias(item.nombreCorto)] || aliasSugerido(item.nombreCorto),
      importe: item.precioFinal,
      tipo: 'item',
      estimado: Boolean(item.estimado),
      columnaIndice: item.columnaIndice,
    });
  }

  // El total es la suma de lo que se muestra. No hay otra fuente.
  const total = lineas.reduce((a, l) => a + l.importe, 0);

  const cuerpo = lineas.map((l) => `${l.etiqueta} ${l.importe}`);
  const texto = [
    p.saludo,
    ...cuerpo,
    `${moneda(total)}, ${p.cierre}`,
    // Si todavía no cargaste tu alias, no mandamos una línea vacía.
    p.aliasTransferencia ? `Alias: ${p.aliasTransferencia}` : null,
  ].filter(Boolean).join('\n');

  return {
    claveCliente: pedido.claveCliente,
    nombre: pedido.nombre,
    telE164: pedido.telE164 || telE164(pedido.telMostrado),
    telMostrado: pedido.telMostrado,
    puntoCodigo: pedido.puntoCodigo,
    lineas,
    total,
    estimados: lineas.filter((l) => l.estimado).length,
    texto,
  };
}

/** Link de WhatsApp con el mensaje ya cargado. */
export function linkWhatsApp(cuenta) {
  const numero = String(cuenta.telE164 || '').replace(/[^\d]/g, '');
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(cuenta.texto)}`;
}

/** Todas las cuentas de una lista, en el orden del recorrido. */
export function informeCobros(lista, opciones = {}) {
  const orden = opciones.ordenPuntos || [];
  const posicion = new Map(orden.map((c, i) => [c, i]));
  const saldos = opciones.saldos || {};

  const cuentas = lista.pedidos
    .slice()
    .sort((a, b) => {
      const pa = posicion.has(a.puntoCodigo) ? posicion.get(a.puntoCodigo) : 999;
      const pb = posicion.has(b.puntoCodigo) ? posicion.get(b.puntoCodigo) : 999;
      return pa - pb || a.nombre.localeCompare(b.nombre, 'es');
    })
    .map((p) => armarCuenta(p, { ...opciones, saldoAnterior: saldos[p.claveCliente] }));

  return {
    fecha: lista.fecha,
    cuentas,
    total: cuentas.reduce((a, c) => a + c.total, 0),
    conEstimados: cuentas.filter((c) => c.estimados > 0).length,
  };
}

/**
 * El balance: los totales agrupados por punto de retiro, sin los mensajes.
 * @param {object} inf salida de informeCobros
 * @param {Array} puntos los puntos de la lista, para las etiquetas
 */
export function balancePorPunto(inf, puntos = []) {
  const etiquetas = new Map(puntos.map((p) => [p.codigo, p.etiqueta]));
  const porPunto = new Map();

  for (const cuenta of inf.cuentas) {
    const codigo = cuenta.puntoCodigo || 'SIN_PUNTO';
    if (!porPunto.has(codigo)) {
      porPunto.set(codigo, {
        codigo,
        etiqueta: etiquetas.get(codigo) || 'Sin punto de retiro',
        cuentas: [],
        total: 0,
      });
    }
    const p = porPunto.get(codigo);
    p.cuentas.push(cuenta);
    p.total += cuenta.total;
  }

  const grupos = [...porPunto.values()];
  return {
    grupos,
    // El total sale de los subtotales, que salen de las cuentas: una sola fuente.
    total: grupos.reduce((a, g) => a + g.total, 0),
    cuentas: inf.cuentas.length,
  };
}
