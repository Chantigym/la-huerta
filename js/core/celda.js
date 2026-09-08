// Interpreta una celda de pedido: "3 kg promo $5650", "1 atado Sin hojas por favor".
//
// Regla de oro del cobro: si la celda trae un $, ese precio manda y pisa el del
// encabezado. "3 kg promo $5650" son $5650, NO 3 x $2200.

import { leerPrecio, limpiar, sinAcentos } from './formato.js';
import { detectarUnidad } from './encabezado.js';

// Palabras de opcion comercial que no son notas del cliente.
const RUIDO = /^(?:x|de|del|la|el|los|las|y|con|en|a|por|para|promo|oferta|aprox|c\/u)$/i;

/** Normaliza para comparar: sin acentos, minusculas, sin plural simple. */
function raiz(palabra) {
  const p = sinAcentos(String(palabra || '')).toLowerCase().replace(/[^a-z0-9/]/g, '');
  if (p.length > 3 && p.endsWith('es')) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1);
  return p;
}


/**
 * Cuanto hay que COSECHAR, que no siempre es la cantidad de la celda.
 * "BOLSA 18 kg $29.800" se cobra 29800 pero se cosechan 18 kg, no 1.
 * "1 paquete 1/2 kg" son 0,5 kg. Buscamos el numero pegado a la unidad
 * de venta de la columna, y recien si no aparece usamos la cantidad.
 */
export function cantidadDeCosecha(texto, unidadCol, cantidad) {
  const t = String(texto || '');
  if (!unidadCol) return cantidad;
  const u = (unidadCol === 'c/u' ? 'unidad' : unidadCol).slice(0, 4).toLowerCase();
  // Numero (o fraccion) seguido de una palabra. Nos quedamos con el primero
  // cuya palabra sea la unidad de venta de la columna.
  const re = /(\d+)\s*\/\s*(\d+)\s*([a-záéíóúñ]+)|(\d+(?:[.,]\d+)?)\s*([a-záéíóúñ]+)/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    const palabra = (m[3] || m[5] || '').toLowerCase();
    if (!palabra.startsWith(u)) continue;
    if (m[1]) return parseInt(m[1], 10) / parseInt(m[2], 10);
    return parseFloat(String(m[4]).replace(',', '.'));
  }
  return cantidad;
}

/**
 * @param {string} texto contenido crudo de la celda
 * @param {object} col encabezado ya interpretado (leerEncabezado)
 */
export function leerCelda(texto, col) {
  const crudo = limpiar(texto);
  const vacio = { textoCrudo: '', vacia: true };
  if (!crudo) return vacio;

  const avisos = [];
  const precioFijado = leerPrecio(crudo);

  // Cantidad: el numero con el que arranca la celda. Si no arranca con numero
  // ("BOLSA 18 kg $29.800", "Maple $13.000") es un solo item de esa opcion.
  const mCant = crudo.match(/^\s*(\d+(?:[.,]\d+)?)/);
  const cantidad = mCant ? parseFloat(mCant[1].replace(',', '.')) : 1;
  const cantidadExplicita = Boolean(mCant);

  const u = detectarUnidad(crudo);
  const unidad = u ? u.clave : null;

  // Sobrante = lo que no es cantidad, unidad, precio, ruido comercial ni parte
  // del nombre del producto. Eso es la nota que escribio el cliente.
  const enEncabezado = new Set(
    limpiar(col && col.encabezadoCrudo ? col.encabezadoCrudo : '')
      .split(/[\s,.;:()!¡?¿]+/).map(raiz).filter(Boolean)
  );
  const sinPrecio = crudo.replace(/\$\s*[\d.]+/g, ' ');
  const palabras = sinPrecio.split(/\s+/).filter(Boolean);
  // La nota arranca en la primera palabra que no se explica sola y sigue hasta
  // el final: asi "Sin hojas por favor" queda entero y no pierde el "por".
  let inicioNota = -1;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    if (i === 0 && cantidadExplicita) continue;          // la cantidad inicial
    if (/^\d+(?:[.,/]\d+)?$/.test(p)) continue;          // numeros sueltos: 18, 1/2
    if (/^\d+\s*kgs?$/i.test(p)) continue;               // "1kg" pegado
    const r = raiz(p);
    if (!r) continue;
    if (RUIDO.test(r)) continue;
    if (unidad && raiz(unidad) === r) continue;          // la unidad
    if (detectarUnidad(p)) continue;                     // otra unidad reconocida
    if (enEncabezado.has(r)) continue;                   // repite el nombre del producto
    inicioNota = i;
    break;
  }
  const nota = inicioNota >= 0 ? palabras.slice(inicioNota).join(' ').trim() : '';

  // Semaforo. Amarillo = interpretada, pero conviene que la mires.
  let confianza = 'verde';
  const unidadCol = col ? col.unidad : null;

  if (precioFijado === null && col && col.precio === null) {
    confianza = 'rojo';
    avisos.push('No hay precio ni en la celda ni en el encabezado.');
  } else if (precioFijado === null && cantidad > 1 && unidad && unidadCol && unidad !== unidadCol) {
    confianza = 'amarillo';
    avisos.push(`Pidió ${cantidad} ${unidad} pero la columna se vende por ${unidadCol}.`);
  } else if (precioFijado === null && cantidad > 1 && !unidad && unidadCol === 'kg') {
    // "3 paltas" en una columna que se vende por kg: no sabemos cuantos kg son.
    confianza = 'amarillo';
    avisos.push(`Pidió ${cantidad} unidades pero la columna se vende por kg. Confirmalo.`);
  }

  return {
    textoCrudo: crudo,
    vacia: false,
    cantidad,
    cantidadExplicita,
    cantidadCosecha: cantidadDeCosecha(crudo, col ? col.unidad : null, cantidad),
    unidad,
    precioFijado,
    nota,
    confianza,
    avisos,
  };
}
