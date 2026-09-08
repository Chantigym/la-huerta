// Convierte la matriz cruda del PDF en una Lista y sus Pedidos.
//
// Nada se hardcodea por posicion: las columnas fijas se buscan por nombre de
// encabezado, asi que si la semana que viene el telefono deja de estar ultimo
// o aparece una columna nueva, sigue funcionando.

import { leerEncabezado, desambiguarNombres } from './encabezado.js';
import { leerCelda } from './celda.js';
import { calcularItem, totalPedido } from './precios.js';
import { limpiar, sinAcentos, telE164, claveCliente, fechaISO } from './formato.js';

const FIJAS = [
  { rol: 'marca', re: /marca\s+temporal|timestamp/i },
  { rol: 'nombre', re: /^tu\s+nombre|^nombre/i },
  { rol: 'punto', re: /donde\s+retir|punto\s+de\s+retiro/i },
  { rol: 'telefono', re: /tel[eé]fono|celular|whatsapp/i },
];

/** Clasifica cada columna: fija (marca/nombre/punto/telefono) o producto. */
export function clasificarColumnas(encabezados, renglones) {
  const roles = {};
  const productos = [];
  encabezados.forEach((h, i) => {
    const texto = sinAcentos(limpiar(h));
    const fija = FIJAS.find((f) => f.re.test(texto) && roles[f.rol] === undefined);
    if (fija) { roles[fija.rol] = i; return; }
    if (limpiar(h)) productos.push(leerEncabezado(renglones ? renglones[i] : [h], i));
  });
  return { roles, productos: desambiguarNombres(productos) };
}

/** "MERLO a partir de las 12hs en adelante en Elemental" -> MERLO + resto. */
export function normalizarPunto(crudo) {
  const texto = limpiar(crudo);
  if (!texto) return null;
  const palabras = texto.split(' ');
  const nombre = [];
  for (const p of palabras) {
    const limpio = p.replace(/[.,;:]$/, '');
    const letras = limpio.replace(/[^A-Za-zÁÉÍÓÚÜÑ/]/gi, '');
    if (letras.length >= 2 && letras === letras.toUpperCase()) nombre.push(limpio);
    else break;
  }
  const etiqueta = nombre.join(' ') || palabras[0];
  const resto = texto.slice(etiqueta.length).trim();
  const mHora = resto.match(/(?:a partir de|de)\s+las?\s+[^.]*|de\s+\d[\d.:]*\s*(?:a|hasta)[^.]*/i);
  return {
    codigo: sinAcentos(etiqueta).toUpperCase().replace(/[\s/]+/g, '_'),
    etiqueta,
    etiquetaCruda: texto,
    horario: mHora ? limpiar(mHora[0]) : '',
    direccion: limpiar(resto),
  };
}

/** Fecha de la lista: del nombre del archivo, si no de las marcas temporales. */
export function fechaDeLista(nombreArchivo, marcas) {
  const m = String(nombreArchivo || '').match(/(\d{1,2})[_\-/](\d{1,2})[_\-/](\d{2,4})/);
  if (m) {
    let anio = parseInt(m[3], 10);
    if (anio < 100) anio += 2000;
    return fechaISO(new Date(anio, parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
  }
  for (const t of marcas || []) {
    const f = String(t).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (f) return fechaISO(new Date(+f[3], +f[2] - 1, +f[1]));
  }
  return fechaISO(new Date());
}

/**
 * Arma la Lista completa a partir de lo que devolvio leerPDF.
 * @param {string[][]} tabla
 * @param {string[][][]} renglones renglones por celda (preserva productor)
 * @param {string} nombreArchivo
 */
export function armarLista(tabla, renglones, nombreArchivo) {
  if (!tabla || !tabla.length) throw new Error('La tabla vino vacia.');
  const encabezados = tabla[0];
  const rengEnc = renglones && renglones[0] ? renglones[0] : encabezados.map((h) => [h]);
  const { roles, productos } = clasificarColumnas(encabezados, rengEnc);

  const faltan = ['nombre', 'punto'].filter((r) => roles[r] === undefined);
  if (faltan.length) {
    throw new Error(`No encontre las columnas: ${faltan.join(', ')}. Revisa el archivo.`);
  }

  const filas = tabla.slice(1).filter((f) => f.some((c) => limpiar(c)));
  const porIndice = new Map(productos.map((p) => [p.indice, p]));

  const puntos = new Map();
  const clientes = new Map();
  const pedidos = [];
  let alertas = 0;

  for (const fila of filas) {
    const nombre = limpiar(fila[roles.nombre]);
    const telCrudo = roles.telefono !== undefined ? limpiar(fila[roles.telefono]) : '';
    const punto = normalizarPunto(fila[roles.punto]);
    if (punto && !puntos.has(punto.codigo)) puntos.set(punto.codigo, { ...punto, orden: puntos.size });

    const clave = claveCliente(nombre, telCrudo);
    if (!clientes.has(clave)) {
      clientes.set(clave, {
        clave, nombre, telE164: telE164(telCrudo), telMostrado: telCrudo,
        puntoHabitual: punto ? punto.codigo : null,
      });
    }

    const items = [];
    for (const [i, col] of porIndice) {
      const texto = fila[i];
      if (!limpiar(texto)) continue;
      const leido = leerCelda(texto, col);
      if (leido.vacia) continue;
      const calc = calcularItem(leido, col, null);
      if (leido.confianza !== 'verde') alertas++;
      items.push({
        columnaIndice: i,
        nombreCorto: col.nombreCorto,
        unidadCol: col.unidad,
        sePesa: col.sePesa,
        ...leido,
        pesoReal: null,
        precioFinal: calc.precio,
        estimado: calc.estimado,
        basePrecio: calc.base,
      });
    }

    pedidos.push({
      claveCliente: clave,
      nombre,
      telMostrado: telCrudo,
      telE164: telE164(telCrudo),
      puntoCodigo: punto ? punto.codigo : null,
      marcaTemporal: roles.marca !== undefined ? limpiar(fila[roles.marca]) : '',
      items,
      total: totalPedido(items.map((i) => ({ precio: i.precioFinal }))),
    });
  }

  const marcas = roles.marca !== undefined ? filas.map((f) => f[roles.marca]) : [];
  return {
    fecha: fechaDeLista(nombreArchivo, marcas),
    archivoOrigen: nombreArchivo || '',
    roles,
    columnas: productos,
    puntos: [...puntos.values()],
    clientes: [...clientes.values()],
    pedidos,
    resumen: {
      pedidos: pedidos.length,
      productos: productos.length,
      productosConPedido: productos.filter((p) => pedidos.some((q) => q.items.some((i) => i.columnaIndice === p.indice))).length,
      celdasParaRevisar: alertas,
    },
  };
}
