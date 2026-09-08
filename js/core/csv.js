// Fallback: el CSV/TSV que baja el mismo Google Sheet.
//
// El PDF es la ruta comoda; esto es el paracaidas, porque es la fuente sin
// perdida. Produce exactamente la misma estructura que leerPDF, asi que de
// aca para adelante el resto de la app no se entera de por donde vino.

/** Parser de CSV con comillas dobles y saltos de linea adentro de una celda. */
export function parsearCSV(texto, separador) {
  const s = String(texto || '').replace(/^﻿/, '');   // sacar el BOM de Excel
  const sep = separador || detectarSeparador(s);
  const filas = [];
  let fila = [], celda = '', enComillas = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (enComillas) {
      if (c === '"') {
        if (s[i + 1] === '"') { celda += '"'; i++; }
        else enComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"') { enComillas = true; continue; }
    if (c === sep) { fila.push(celda); celda = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; continue; }
    celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((x) => String(x).trim()));
}

function detectarSeparador(s) {
  const cabeza = s.slice(0, 4000);
  const cuenta = (ch) => (cabeza.split(ch).length - 1);
  return cuenta('\t') > cuenta(',') ? '\t' : ',';
}

/**
 * Lee un CSV y devuelve lo mismo que leerPDF: tabla, renglones y meta.
 * Los renglones de cada celda salen de los saltos de linea que el Sheet guarda
 * adentro del texto, que es donde vive el productor en los encabezados.
 */
export function leerCSV(texto) {
  const filas = parsearCSV(texto);
  if (!filas.length) throw new Error('El CSV vino vacío.');
  const columnas = Math.max(...filas.map((f) => f.length));
  const tabla = filas.map((f) => {
    const fila = f.map((c) => String(c).replace(/\s+/g, ' ').trim());
    while (fila.length < columnas) fila.push('');
    return fila;
  });
  const renglones = filas.map((f) => {
    const fila = f.map((c) => String(c).split(/\r?\n/).map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean));
    while (fila.length < columnas) fila.push([]);
    return fila;
  });
  return {
    tabla,
    renglones,
    meta: { columnas, filas: tabla.length, origen: 'csv', metodoGrilla: 'csv', itemsFueraDeGrilla: 0 },
  };
}
