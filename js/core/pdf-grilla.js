// Extrae la tabla del PDF de respuestas del Google Form.
//
// Por que este archivo existe y no alcanza la extraccion de texto comun:
//  - El PDF dibuja la tabla con lineas trazadas, no con rectangulos.
//  - La letra es de 0.8pt y el texto que desborda una celda se dibuja encima
//    de la vecina, en la misma linea de base. Ordenar caracteres por X los
//    intercala y produce basura.
//  - Cada celda con texto es un bloque BT..ET propio, asi que pdf.js ya nos
//    entrega el texto agrupado y posicionado. No hace falta reagrupar chars.
//  - Una celda puede tener DOS renglones (arriba producto y precio, abajo el
//    productor). Hay que unirlos por linea de base, NO deduplicarlos.

import * as pdfjs from '../../vendor/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.mjs', import.meta.url).href;

const TOL_GRILLA = 0.5;
const TOL_RENGLON = 0.5;

const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Agrupa valores cercanos en un solo borde. */
export function agrupar(valores, tol = TOL_GRILLA) {
  if (!valores.length) return [];
  const v = valores.slice().sort((a, b) => a - b);
  const out = [v[0]];
  for (const x of v.slice(1)) if (x - out[out.length - 1] > tol) out.push(x);
  return out;
}

/** Indice del intervalo que contiene a x. -1 si cae afuera. */
export function indiceIntervalo(bordes, x) {
  let lo = 0, hi = bordes.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (bordes[m] <= x) lo = m + 1; else hi = m;
  }
  const i = lo - 1;
  return i >= 0 && i < bordes.length - 1 ? i : -1;
}

/**
 * Recorre la lista de operadores llevando la pila de CTM a mano
 * (pdf.js NO aplica la transformacion a los paths por nosotros)
 * y devuelve los segmentos rectos trazados, en coordenadas de pagina.
 */
function extraerLineas(ol, alto) {
  const OPS = pdfjs.OPS;
  let ctm = [1, 0, 0, 1, 0, 0];
  const pila = [];
  const lineas = [];
  let subpaths = [], cur = [];

  const cerrarSub = () => { if (cur.length > 1) subpaths.push(cur); cur = []; };
  const volcar = () => {
    cerrarSub();
    for (const sp of subpaths) {
      for (let i = 0; i + 1 < sp.length; i++) {
        const a = sp[i], b = sp[i + 1];
        lineas.push({ x0: a[0], y0: alto - a[1], x1: b[0], y1: alto - b[1] });
      }
    }
    subpaths = [];
  };
  const descartar = () => { cur = []; subpaths = []; };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === OPS.save) pila.push(ctm.slice());
    else if (fn === OPS.restore) ctm = pila.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(args, ctm);
    else if (fn === OPS.constructPath) {
      const ops = args[0], co = args[1];
      let k = 0;
      for (const op of ops) {
        if (op === OPS.moveTo) { cerrarSub(); cur = [aplicar(ctm, co[k], co[k + 1])]; k += 2; }
        else if (op === OPS.lineTo) { cur.push(aplicar(ctm, co[k], co[k + 1])); k += 2; }
        else if (op === OPS.curveTo) { k += 6; }
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) { k += 4; }
        else if (op === OPS.rectangle) {
          const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3];
          k += 4;
          cerrarSub();
          subpaths.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
            .map((p) => aplicar(ctm, p[0], p[1])));
        }
      }
      cerrarSub();
    }
    else if (fn === OPS.stroke || fn === OPS.closeStroke ||
             fn === OPS.fillStroke || fn === OPS.eoFillStroke ||
             fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) volcar();
    else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath) descartar();
  }
  return lineas;
}

/** Bordes de columna y de fila a partir de los segmentos trazados. */
export function construirGrilla(lineas) {
  const vert = lineas.filter((l) => Math.abs(l.x0 - l.x1) < 0.6 && Math.abs(l.y0 - l.y1) >= 0.6);
  const horiz = lineas.filter((l) => Math.abs(l.y0 - l.y1) < 0.6 && Math.abs(l.x0 - l.x1) >= 0.6);
  return {
    vx: agrupar(vert.map((l) => l.x0)),
    hy: agrupar(horiz.map((l) => l.y0)),
    segmentosVert: vert.length,
    segmentosHoriz: horiz.length,
  };
}

/**
 * Red de seguridad: si la grilla trazada no sirve, los bordes de columna se
 * deducen de donde arranca cada encabezado (el x del primer caracter es el
 * borde izquierdo de la celda, aun cuando el texto desborde a la vecina).
 */
export function grillaDesdeEncabezados(items, hy) {
  if (hy.length < 2) return [];
  const primera = items.filter((i) => i.top >= hy[0] && i.top < hy[1] && i.texto.trim());
  const xs = agrupar(primera.map((i) => i.x), 2);
  if (xs.length < 2) return [];
  const paso = (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
  return xs.map((x) => x - 0.5).concat([xs[xs.length - 1] + paso]);
}

/**
 * Devuelve los renglones de una celda por separado.
 * Importante: NO deduplicar. Lo que parece texto repetido son en realidad dos
 * renglones distintos de la misma celda (arriba producto y precio, abajo el
 * productor) con lineas de base a ~1pt. Al ordenar por X se intercalan y sale
 * "11 aa tt aa dd oo"; agrupando por linea de base salen limpios y separados.
 */
function renglonesDeCelda(items) {
  if (!items || !items.length) return [];
  const orden = items.slice().sort((a, b) => a.top - b.top || a.x - b.x);
  const renglones = [];
  for (const it of orden) {
    const ult = renglones[renglones.length - 1];
    if (ult && Math.abs(it.top - ult.top) <= TOL_RENGLON) ult.partes.push(it);
    else renglones.push({ top: it.top, partes: [it] });
  }
  return renglones
    .map((r) => r.partes.sort((a, b) => a.x - b.x).map((p) => p.texto).join(''))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length);
}

/**
 * Lee el PDF y devuelve la matriz de celdas, la matriz de renglones por celda
 * (que preserva la separacion producto / productor) y metadatos de diagnostico.
 * @param {ArrayBuffer|Uint8Array} datos
 */
export async function leerPDF(datos) {
  // Buffer de Node pasa el instanceof Uint8Array pero pdf.js lo rechaza.
  const data = new Uint8Array(datos);
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const paginas = doc.numPages;
  const tabla = [], renglones = [];
  let meta = null;

  for (let n = 1; n <= paginas; n++) {
    const page = await doc.getPage(n);
    const vista = page.getViewport({ scale: 1 });
    const alto = vista.height;
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((i) => typeof i.str === 'string' && i.str.length)
      .map((i) => ({ texto: i.str, x: i.transform[4], top: alto - i.transform[5] }));

    const g = construirGrilla(extraerLineas(await page.getOperatorList(), alto));
    const hy = g.hy;
    let vx = g.vx;
    let metodo = 'grilla';
    if (vx.length < 3 || hy.length < 2) {
      vx = grillaDesdeEncabezados(items, hy);
      metodo = 'encabezados';
    }

    const celdas = new Map();
    let fuera = 0;
    for (const it of items) {
      // El x del PRIMER caracter define la columna: el texto que desborda se
      // dibuja sobre la celda vecina, asi que el centro daria la columna mal.
      const ci = indiceIntervalo(vx, it.x + 0.3);
      const ri = indiceIntervalo(hy, it.top - 0.2);
      if (ci < 0 || ri < 0) { if (it.texto.trim()) fuera++; continue; }
      const k = ri + ',' + ci;
      if (!celdas.has(k)) celdas.set(k, []);
      celdas.get(k).push(it);
    }

    const nFilas = Math.max(0, hy.length - 1);
    const nCols = Math.max(0, vx.length - 1);
    for (let r = 0; r < nFilas; r++) {
      const filaR = [], filaT = [];
      for (let c = 0; c < nCols; c++) {
        const rs = renglonesDeCelda(celdas.get(r + ',' + c));
        filaR.push(rs);
        filaT.push(rs.join(' '));
      }
      renglones.push(filaR);
      tabla.push(filaT);
    }
    if (n === 1) {
      meta = { ancho: vista.width, alto, columnas: nCols, items: items.length,
               metodoGrilla: metodo, itemsFueraDeGrilla: fuera,
               segmentosVert: g.segmentosVert, segmentosHoriz: g.segmentosHoriz };
    }
  }
  await doc.destroy();
  return { tabla, renglones, meta: { ...meta, paginas, filas: tabla.length } };
}
