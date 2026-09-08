// XLSX sin librerías: un .xlsx es un zip con unos XML adentro, y el zip ya lo
// sabemos armar (js/img/zip.js). Los textos van en línea, así evitamos la
// tabla de cadenas compartidas y queda todo mucho más simple.

import { armarZip } from '../img/zip.js';

const cod = new TextEncoder();
const bytes = (s) => cod.encode(s);

/** Excel rechaza el archivo entero si aparece un carácter de control. */
function sinControles(s) {
  let salida = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) continue;
    salida += ch;
  }
  return salida;
}

/** Escapa lo que va adentro de un XML. */
function esc(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return sinControles(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A1, B1, ... Z1, AA1 */
export function nombreCelda(fila, columna) {
  let n = '', c = columna;
  do { n = String.fromCharCode(65 + (c % 26)) + n; c = Math.floor(c / 26) - 1; } while (c >= 0);
  return n + (fila + 1);
}

function hoja(filas) {
  const xml = filas.map((fila, f) => {
    const celdas = fila.map((valor, c) => {
      const ref = nombreCelda(f, c);
      if (typeof valor === 'number' && Number.isFinite(valor)) {
        return `<c r="${ref}"><v>${valor}</v></c>`;
      }
      if (valor === null || valor === undefined || valor === '') return '';
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
    }).join('');
    return `<row r="${f + 1}">${celdas}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${xml}</sheetData></worksheet>`;
}

/** Excel no acepta cualquier nombre de hoja. */
export function nombreHojaValido(nombre, usados = new Set()) {
  let n = String(nombre || 'Hoja').replace(/[\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'Hoja';
  const base = n;
  let i = 2;
  while (usados.has(n.toLowerCase())) { n = (base.slice(0, 28) + ' ' + i).slice(0, 31); i++; }
  usados.add(n.toLowerCase());
  return n;
}

/**
 * Arma un .xlsx con una hoja por cada entrada.
 * @param {Array<{nombre: string, filas: Array<Array>}>} hojas
 * @returns los archivos que van adentro del zip
 */
export function partesXLSX(hojas) {
  const usados = new Set();
  const limpias = (hojas || []).map((h) => ({ nombre: nombreHojaValido(h.nombre, usados), filas: h.filas || [] }));
  if (!limpias.length) limpias.push({ nombre: 'Hoja', filas: [] });

  const tipos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    limpias.map((_, i) => `<Override PartName="/xl/worksheets/hoja${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>';

  const relRaiz = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const libro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    limpias.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets></workbook>';

  const relLibro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    limpias.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/hoja${i + 1}.xml"/>`).join('') +
    '</Relationships>';

  const archivos = [
    { nombre: '[Content_Types].xml', datos: bytes(tipos) },
    { nombre: '_rels/.rels', datos: bytes(relRaiz) },
    { nombre: 'xl/workbook.xml', datos: bytes(libro) },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: bytes(relLibro) },
    ...limpias.map((h, i) => ({ nombre: `xl/worksheets/hoja${i + 1}.xml`, datos: bytes(hoja(h.filas)) })),
  ];

  return archivos;
}

/** El .xlsx completo, listo para bajar. */
export function armarXLSX(hojas) {
  const zip = armarZip(partesXLSX(hojas));
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
