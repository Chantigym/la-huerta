import { sinAcentos } from './formato.js';
import { FAMILIAS, ETIQUETA_FAMILIA, familiaDe } from './categorias.js';
// Informe A - COSECHA: que hay que levantar y cuanto, antes de armar nada.
//
// Va agrupado por origen porque no es lo mismo lo que cosechas vos que lo que
// le comprás a otro y solo redistribuis. Primero produccion propia.

const ETIQUETAS = {
  propia: 'Producción propia',
  terceros: 'De terceros',
  sinDefinir: 'Sin origen definido',
};
const ORDEN = ['propia', 'terceros', 'sinDefinir'];

/**
 * @param {object} lista salida de armarLista
 * @param {object} opciones { margen: 0.10 } margen de descarte, en tanto por uno
 */
export function informeCosecha(lista, opciones = {}) {
  const margen = opciones.margen === undefined ? 0.10 : opciones.margen;
  const porColumna = new Map();

  for (const pedido of lista.pedidos) {
    for (const item of pedido.items) {
      if (!porColumna.has(item.columnaIndice)) {
        const col = lista.columnas.find((c) => c.indice === item.columnaIndice);
        porColumna.set(item.columnaIndice, {
          indice: item.columnaIndice,
          nombreCorto: item.nombreCorto,
          unidad: item.unidadCol || item.unidad || 'unidad',
          sePesa: Boolean(item.sePesa),
          productor: col ? col.productor : '',
          origen: col ? col.origen : 'sinDefinir',
          total: 0,
          pedidos: 0,
          notas: [],
          detalle: [],
        });
      }
      const p = porColumna.get(item.columnaIndice);
      p.total += item.cantidadCosecha || item.cantidad || 0;
      p.pedidos += 1;
      p.detalle.push({
        cliente: pedido.nombre,
        punto: pedido.puntoCodigo,
        cantidad: item.cantidadCosecha || item.cantidad,
        nota: item.nota || '',
      });
      if (item.nota) p.notas.push(`${pedido.nombre}: ${item.nota}`);
    }
  }

  // Los productos que nadie pidio simplemente no estan: nunca entraron al mapa.
  const productos = [...porColumna.values()].map((p) => ({
    ...p,
    total: redondearCantidad(p.total),
    conMargen: redondearCantidad(p.total * (1 + margen)),
  }));

  const grupos = ORDEN.map((origen) => ({
    origen,
    etiqueta: ETIQUETAS[origen],
    productos: productos
      .filter((p) => p.origen === origen)
      .sort((a, b) => a.nombreCorto.localeCompare(b.nombreCorto, 'es')),
  })).filter((g) => g.productos.length);

  return {
    fecha: lista.fecha,
    margen,
    grupos,
    totalProductos: productos.length,
    totalPedidos: lista.pedidos.length,
  };
}

/** Las cantidades de cosecha no necesitan mas de 2 decimales. */
function redondearCantidad(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** El productor viene con la descripción pegada: alcanza con la primera frase. */
function recortarProveedor(texto) {
  const t = String(texto || '').trim();
  if (!t) return 'Sin proveedor';
  const corte = t.split('.')[0].trim();
  return (corte.length >= 3 ? corte : t).slice(0, 46);
}

/**
 * La cosecha como se mira antes de salir: primero verdura, después fruta,
 * después huevos y al final almacén. Adentro de cada familia, lo tuyo primero
 * y lo demás separado por proveedor, que es como se hacen los pedidos.
 */
export function cosechaPorFamilia(lista, opciones = {}) {
  const inf = informeCosecha(lista, opciones);
  const productos = inf.grupos.flatMap((g) => g.productos);
  const porColumna = new Map(lista.columnas.map((c) => [c.indice, c]));

  const familias = FAMILIAS.map((familia) => {
    const suyos = productos.filter((p) => familiaDe(porColumna.get(p.indice) || p) === familia);
    const porProveedor = new Map();

    for (const p of suyos) {
      const etiqueta = p.origen === 'propia' ? 'Producción propia' : recortarProveedor(p.productor);
      const clave = p.origen === 'propia' ? 'propia' : sinAcentos(etiqueta).toLowerCase();
      if (!porProveedor.has(clave)) {
        porProveedor.set(clave, { clave, etiqueta, propia: p.origen === 'propia', productos: [] });
      }
      porProveedor.get(clave).productos.push(p);
    }

    const grupos = [...porProveedor.values()]
      .map((g) => ({ ...g, productos: g.productos.sort((a, b) => a.nombreCorto.localeCompare(b.nombreCorto, 'es')) }))
      .sort((a, b) => (b.propia ? 1 : 0) - (a.propia ? 1 : 0) || a.etiqueta.localeCompare(b.etiqueta, 'es'));

    return { familia, etiqueta: ETIQUETA_FAMILIA[familia], grupos, cantidad: suyos.length };
  }).filter((f) => f.cantidad > 0);

  return { fecha: inf.fecha, margen: inf.margen, familias, totalProductos: productos.length };
}

/**
 * La cosecha como texto pelado, para pegar en WhatsApp:
 *
 *   Lechuga 2
 *   Rabanito 3
 *   Zanahoria 3k
 *
 * Lo que va por kilo lleva una "k" pegada al número; el resto va sin unidad.
 * Usa el nombre corto que vos elegiste, salvo que dos productos terminen
 * llamándose igual: ahí gana el nombre completo, para no confundirlos.
 */
export function textoDeCosecha(inf, alias = {}) {
  const productos = inf.familias.flatMap((f) => f.grupos.flatMap((g) => g.productos));

  const cuenta = new Map();
  for (const p of productos) {
    const corto = alias[claveDeAlias(p.nombreCorto)] || p.nombreCorto;
    cuenta.set(corto.toLowerCase(), (cuenta.get(corto.toLowerCase()) || 0) + 1);
  }

  return productos.map((p) => {
    const corto = alias[claveDeAlias(p.nombreCorto)] || p.nombreCorto;
    const nombre = cuenta.get(corto.toLowerCase()) > 1 ? p.nombreCorto : corto;
    return `${nombre} ${numero(p.total)}${p.unidad === 'kg' ? 'k' : ''}`;
  }).join('\n');
}

/** Misma clave que usa el diccionario de alias de los cobros. */
function claveDeAlias(nombreCorto) {
  return sinAcentos(String(nombreCorto || '').replace(/\s+/g, ' ').trim()).toLowerCase();
}

/** 3 -> "3", 0.5 -> "0,5" (coma decimal, como se escribe acá). */
function numero(n) {
  return String(Math.round((n + Number.EPSILON) * 100) / 100).replace('.', ',');
}
