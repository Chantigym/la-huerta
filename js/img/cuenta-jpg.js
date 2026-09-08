// La cuenta como imagen, para cuando el texto de WhatsApp se corta o se ve feo.
// Se dibuja con Canvas: sin librerías, y funciona offline.

import { moneda, fecha, sinAcentos } from '../core/formato.js';

const ANCHO = 1080;
const MARGEN = 64;
const BANDA = 104;          // franja oscura de arriba
const RENGLON = 58;         // alto de cada línea de ítem
const PIE = 210;            // total + alias

const TINTA = '#1c2419';
const PAPEL = '#fbfcfa';
const SUAVE = '#5a6553';
const LINEA = '#c9d2c2';
const AMBAR = '#b87514';

const MONO = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Alto que va a tener la imagen. Puro, para poder testearlo sin navegador. */
export function altoDeCuenta(cantidadLineas, tieneAviso = false) {
  return BANDA + 96 + cantidadLineas * RENGLON + PIE + (tieneAviso ? 50 : 0);
}

/** 2026-09-05_Nombre-Apellido_1122334455.jpg */
export function nombreArchivo(cuenta, fechaLista) {
  const limpio = (s) => sinAcentos(String(s || ''))
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const tel = String(cuenta.telMostrado || cuenta.telE164 || '').replace(/\D/g, '') || 'sin-tel';
  return `${fechaLista}_${limpio(cuenta.nombre) || 'sin-nombre'}_${tel}.jpg`;
}

/**
 * Dibuja la cuenta en un canvas y lo devuelve.
 * @param {object} cuenta salida de armarCuenta
 * @param {object} opciones { fechaLista, aliasTransferencia, escala }
 */
export function dibujarCuenta(cuenta, opciones = {}) {
  const escala = opciones.escala || 1;
  const aviso = cuenta.estimados > 0;
  const alto = altoDeCuenta(cuenta.lineas.length, aviso);

  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO * escala;
  lienzo.height = alto * escala;
  const c = lienzo.getContext('2d');
  c.scale(escala, escala);

  // fondo
  c.fillStyle = PAPEL;
  c.fillRect(0, 0, ANCHO, alto);

  // banda de arriba
  c.fillStyle = TINTA;
  c.fillRect(0, 0, ANCHO, BANDA);
  c.fillStyle = PAPEL;
  c.font = `700 30px ${MONO}`;
  c.textBaseline = 'middle';
  c.fillText('LA · HUERTA', MARGEN, BANDA / 2);
  c.font = `400 26px ${MONO}`;
  c.textAlign = 'right';
  c.fillText(fecha(opciones.fechaLista + 'T12:00:00'), ANCHO - MARGEN, BANDA / 2);
  c.textAlign = 'left';

  // nombre del cliente
  let y = BANDA + 62;
  c.fillStyle = TINTA;
  c.font = `650 42px ${SANS}`;
  c.fillText(cuenta.nombre, MARGEN, y);

  // items
  y = BANDA + 116;
  c.font = `400 34px ${SANS}`;
  for (const linea of cuenta.lineas) {
    c.fillStyle = linea.tipo === 'saldo' ? AMBAR : TINTA;
    c.fillText(linea.etiqueta, MARGEN, y);
    c.font = `500 34px ${MONO}`;
    c.textAlign = 'right';
    c.fillText(String(linea.importe), ANCHO - MARGEN, y);
    c.textAlign = 'left';
    c.font = `400 34px ${SANS}`;

    c.strokeStyle = LINEA;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(MARGEN, y + 22);
    c.lineTo(ANCHO - MARGEN, y + 22);
    c.stroke();
    y += RENGLON;
  }

  // total
  y += 26;
  c.strokeStyle = TINTA;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(MARGEN, y - 34);
  c.lineTo(ANCHO - MARGEN, y - 34);
  c.stroke();

  c.fillStyle = TINTA;
  c.font = `600 26px ${MONO}`;
  c.fillText('TOTAL', MARGEN, y + 16);
  c.font = `700 56px ${MONO}`;
  c.textAlign = 'right';
  c.fillText(moneda(cuenta.total), ANCHO - MARGEN, y + 16);
  c.textAlign = 'left';

  y += 74;
  if (aviso) {
    c.fillStyle = AMBAR;
    c.font = `400 24px ${SANS}`;
    c.fillText(cuenta.estimados === 1
      ? '1 ítem sin pesar: va a precio de lista.'
      : `${cuenta.estimados} ítems sin pesar: van a precio de lista.`, MARGEN, y);
    y += 50;
  }

  c.fillStyle = SUAVE;
  c.font = `400 30px ${MONO}`;
  c.fillText('Alias: ' + (opciones.aliasTransferencia || ''), MARGEN, y + 10);

  return lienzo;
}

/** La cuenta como JPG listo para mandar. */
export function cuentaAJPG(cuenta, opciones = {}) {
  const lienzo = dibujarCuenta(cuenta, opciones);
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No pude generar la imagen.'))),
      'image/jpeg', opciones.calidad || 0.92);
  });
}
