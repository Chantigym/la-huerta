// Interpreta el encabezado de una columna de producto.
//
// El encabezado del Form mezcla nombre, precio, unidad y productor. Por suerte
// el PDF los separa en renglones: el primero trae producto y precio, y alguno
// de los siguientes trae el productor. Ver pdf-grilla.js (renglones por celda).

import { leerPrecios, limpiar } from './formato.js';

// Unidades reconocidas. El orden no importa: gana la que aparezca antes.
const UNIDADES = [
  { clave: 'kg', re: /kgs?\b|\bkilos?\b/i, pesa: true },  // 'kg' pegado a numero: '1/2kg'
  { clave: 'horma', re: /\bhormas?\b/i, pesa: true },
  { clave: 'atado', re: /\batados?\b/i, pesa: false },
  { clave: 'planta', re: /\bplantas?\b/i, pesa: false },
  { clave: 'maple', re: /\bmaples?\b/i, pesa: false },
  { clave: 'frasco', re: /\bfrascos?\b/i, pesa: false },
  { clave: 'paquete', re: /\bpaquetes?\b/i, pesa: false },
  { clave: 'bolsa', re: /\bbolsas?\b/i, pesa: false },
  { clave: 'docena', re: /\bdocenas?\b/i, pesa: false },
  { clave: 'litro', re: /\blitros?\b/i, pesa: false },
  { clave: 'c/u', re: /\bc\/u\b|\bunidad(?:es)?\b/i, pesa: false },
];

const RE_PRODUCTOR = /^\s*(?:de\s|produc(?:ci[oó]n|to)\b|agroecol[oó]gico\s+de\b|elaborad)/i;

/** Unidad de venta: la primera que aparece a partir del precio. */
export function detectarUnidad(texto, desde = 0) {
  const cola = String(texto || '').slice(desde);
  let mejor = null;
  for (const u of UNIDADES) {
    const m = cola.match(u.re);
    if (m && (mejor === null || m.index < mejor.pos)) mejor = { pos: m.index, u };
  }
  return mejor ? mejor.u : null;
}

/** Nombre corto sugerido. Es solo una sugerencia: el alias real lo edita el usuario. */
export function nombreSugerido(renglon) {
  let s = String(renglon || '');
  s = s.split('$')[0];                       // cortar antes del precio
  s = s.replace(/\([^)]*\)?/g, ' ');          // sacar parentesis y su contenido
  s = s.split(/[,.:;!]/)[0];                  // cortar en la primera puntuacion
  s = limpiar(s);
  // Descartar adjetivos de marketing pegados al nombre.
  const ruido = /^(?:nuevo|nueva|nuevos|nuevas|ultimas?|[uú]ltimas?|super|oferta|promo)$/i;
  const palabras = s.split(' ').filter((p) => p && !ruido.test(p));
  const nexo = /^(?:de|del|la|el|los|las|y|con|en|a|para|puro|pura)$/i;
  const corto = (palabras.length > 1 && !nexo.test(palabras[1]))
    ? palabras.slice(0, 2).join(' ')
    : (palabras[0] || '');
  return capitalizar(corto || limpiar(renglon).slice(0, 20));
}

function capitalizar(s) {
  const t = String(s || '').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Interpreta el encabezado de una columna de producto.
 * @param {string[]} renglones renglones de la celda, tal como los da el PDF
 * @param {number} indice posicion de la columna en la tabla
 */
export function leerEncabezado(renglones, indice) {
  const rs = (renglones || []).map(limpiar).filter(Boolean);
  const completo = rs.join(' ');

  // El renglon con el precio es el que manda para nombre y unidad.
  const iPrecio = rs.findIndex((r) => r.includes('$'));
  const principal = rs[iPrecio >= 0 ? iPrecio : 0] || '';

  const precios = leerPrecios(principal);
  // Primer precio = el de la unidad de venta. Segundo (si hay) = precio por kg,
  // como en "$9500 la horma APROX, (es por kilo $19.000 kg)". El segundo es el
  // que hace falta para cobrar por peso real.
  const precio = precios.length ? precios[0] : null;
  const precioPorKg = precios.length > 1 ? precios[1] : null;

  const posPrecio = precio !== null ? principal.indexOf('$') : 0;
  const u = detectarUnidad(principal, posPrecio);

  // El productor: primer renglon posterior al del precio que parezca un origen.
  let productor = '';
  for (let i = 0; i < rs.length; i++) {
    if (i === iPrecio) continue;
    if (RE_PRODUCTOR.test(rs[i])) { productor = rs[i]; break; }
  }
  if (!productor && rs.length > 1) productor = rs[rs.length - 1];

  // "Elaboración propia" (el chucrut) también es tuyo, no de un tercero.
  const propia = /(?:producci[oó]n|elaboraci[oó]n)\s+propia/i.test(completo);

  return {
    indice,
    encabezadoCrudo: completo,
    renglones: rs,
    nombreCorto: nombreSugerido(principal),
    precio,
    precioPorKg,
    unidad: u ? u.clave : null,
    sePesa: u ? u.pesa : false,
    productor,
    origen: propia ? 'propia' : (productor ? 'terceros' : 'sinDefinir'),
  };
}

/**
 * Cuando dos columnas dan el mismo nombre corto (los dos huevos, por ejemplo)
 * les agrega la palabra que las distingue. Busca primero adentro de los
 * parentesis, que es donde el formulario suele poner la variante.
 */
export function desambiguarNombres(columnas) {
  const porNombre = new Map();
  for (const c of columnas) {
    const k = c.nombreCorto.toLowerCase();
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(c);
  }
  for (const grupo of porNombre.values()) {
    if (grupo.length < 2) continue;
    const bolsas = grupo.map((c) => palabras(c.encabezadoCrudo));
    grupo.forEach((c, i) => {
      const otras = new Set(bolsas.filter((_, j) => j !== i).flatMap((b) => [...b.todas]));
      const propia = [...bolsas[i].parentesis, ...bolsas[i].todas];
      const distinta = propia.find((p) => !otras.has(p) && p.length > 2 && !/^\d+$/.test(p));
      if (distinta) c.nombreCorto = c.nombreCorto + ' ' + distinta;
    });
  }
  return columnas;
}

function palabras(texto) {
  const t = String(texto || '');
  const norm = (s) => sinAcentosMin(s).split(/[^a-z0-9]+/).filter((p) => p.length > 1);
  const dentro = [...t.matchAll(/\(([^)]*)\)/g)].flatMap((m) => norm(m[1]));
  return { parentesis: dentro, todas: new Set(norm(t)) };
}

function sinAcentosMin(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
