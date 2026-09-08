// ZIP en modo "store" (sin comprimir), en unas 70 líneas y sin dependencias.
// Los JPG ya vienen comprimidos: volver a comprimirlos no ahorra nada.

const tablaCRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = tablaCRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora al formato MS-DOS que usa el ZIP. */
function fechaDOS(d = new Date()) {
  const hora = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dia = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { hora, dia };
}

class Escritor {
  constructor() { this.partes = []; this.largo = 0; }
  bytes(b) { this.partes.push(b); this.largo += b.length; }
  u16(n) { this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff])); }
  u32(n) { this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])); }
}

/**
 * @param {Array<{nombre: string, datos: Uint8Array}>} archivos
 * @returns {Blob} el zip
 */
export function armarZip(archivos, fechaBase = new Date()) {
  const { hora, dia } = fechaDOS(fechaBase);
  const codificador = new TextEncoder();
  const w = new Escritor();
  const entradas = [];

  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre);
    const datos = archivo.datos;
    const suma = crc32(datos);
    const desplazamiento = w.largo;

    w.u32(0x04034b50);          // firma de cabecera local
    w.u16(20); w.u16(0); w.u16(0);   // versión, banderas, método 0 = store
    w.u16(hora); w.u16(dia);
    w.u32(suma); w.u32(datos.length); w.u32(datos.length);
    w.u16(nombre.length); w.u16(0);
    w.bytes(nombre);
    w.bytes(datos);

    entradas.push({ nombre, suma, largo: datos.length, desplazamiento });
  }

  const inicioCentral = w.largo;
  for (const e of entradas) {
    w.u32(0x02014b50);          // firma de directorio central
    w.u16(20); w.u16(20); w.u16(0); w.u16(0);
    w.u16(hora); w.u16(dia);
    w.u32(e.suma); w.u32(e.largo); w.u32(e.largo);
    w.u16(e.nombre.length); w.u16(0); w.u16(0); w.u16(0); w.u16(0);
    w.u32(0); w.u32(e.desplazamiento);
    w.bytes(e.nombre);
  }
  const largoCentral = w.largo - inicioCentral;

  w.u32(0x06054b50);            // fin del directorio central
  w.u16(0); w.u16(0);
  w.u16(entradas.length); w.u16(entradas.length);
  w.u32(largoCentral); w.u32(inicioCentral); w.u16(0);

  return new Blob(w.partes, { type: 'application/zip' });
}
