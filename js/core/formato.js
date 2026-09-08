// Formatos argentinos: moneda, fechas, telefonos.
// El punto es SIEMPRE separador de miles, nunca decimal.

/** "$39.865" a partir de 39865. Sin decimales. */
export function moneda(n) {
  const v = Math.round(n || 0);
  const signo = v < 0 ? '-' : '';
  return signo + '$' + miles(Math.abs(v));
}

/** 39865 -> "39.865" (sin simbolo, para las lineas de la cuenta usamos crudo) */
export function miles(n) {
  return String(Math.round(Math.abs(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Lee un precio argentino de un texto: "$2200" -> 2200, "$10.000" -> 10000.
 * Devuelve el PRIMER precio encontrado, que es el de la unidad de venta.
 */
export function leerPrecio(texto) {
  const p = leerPrecios(texto);
  return p.length ? p[0] : null;
}

/** Todos los precios de un texto, en orden de aparicion. */
export function leerPrecios(texto) {
  if (!texto) return [];
  const out = [];
  // $ seguido de digitos con puntos de miles opcionales. Rechaza decimales con coma.
  const re = /\$\s*(\d{1,3}(?:\.\d{3})+|\d+)/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const n = parseInt(m[1].replace(/\./g, ''), 10);
    if (!isNaN(n)) out.push(n);
  }
  return out;
}

/** Redondeo al multiplo de $5 (regla confirmada con las cuentas reales). */
export function redondear5(n) {
  return Math.round((n || 0) / 5) * 5;
}

/** dd/mm/aaaa */
export function fecha(d) {
  const f = d instanceof Date ? d : new Date(d);
  if (isNaN(f)) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()}`;
}

/** aaaa-mm-dd, para nombres de archivo y claves. */
export function fechaISO(d) {
  const f = d instanceof Date ? d : new Date(d);
  if (isNaN(f)) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
}

/**
 * Telefono argentino a E.164 para el link de wa.me.
 * "1122334455" -> "+5491122334455"
 * "011 2233 4455" -> "+5491122334455"
 * "+54 9 11 2233-4455" -> "+5491122334455"
 * "3544111222" -> "+5493544111222"
 *
 * Regla: wa.me para Argentina quiere +54 9 <area> <numero> en celulares.
 * Los numeros que ya vienen con +54 se respetan.
 */
export function telE164(crudo) {
  if (!crudo) return '';
  let d = String(crudo).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  // ya viene con pais
  if (d.startsWith('54')) {
    let resto = d.slice(2);
    if (resto.startsWith('9')) resto = resto.slice(1);
    resto = sacarCeroInicial(resto);
    return '+549' + resto;
  }
  d = sacarCeroInicial(d);
  return '+549' + d;
}

function sacarCeroInicial(s) {
  return s.startsWith('0') ? s.slice(1) : s;
}

/** Clave de identidad de cliente: telefono normalizado + nombre en minusculas. */
export function claveCliente(nombre, tel) {
  return telE164(tel) + '|' + String(nombre || '').trim().toLowerCase();
}

/** Normaliza espacios y recorta. */
export function limpiar(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** Saca acentos y pasa a mayusculas, para comparar encabezados. */
export function sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
