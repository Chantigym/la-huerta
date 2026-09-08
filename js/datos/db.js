// IndexedDB con lo minimo indispensable. Nada de servidor: todo vive en el
// navegador de la maquina donde estas trabajando.
//
// Lo que se guarda aca es el AVANCE de una lista: que ya tildaste y que pesos
// cargaste. Si cerras el celular en el medio de armar las bolsas, al volver
// tenes todo como lo dejaste.

const BASE = 'lahuerta';
const VERSION = 2;
const AVANCE = 'avance';
const CONFIG = 'config';
const LISTAS = 'listas';   // el historial, para arrastrar saldos
const PAGOS = 'pagos';     // quién pagó qué y cuándo

let promesa = null;

function abrir() {
  if (promesa) return promesa;
  promesa = new Promise((resolver, rechazar) => {
    if (!('indexedDB' in globalThis)) { rechazar(new Error('Este navegador no tiene IndexedDB.')); return; }
    const pedido = indexedDB.open(BASE, VERSION);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(AVANCE)) db.createObjectStore(AVANCE, { keyPath: 'listaId' });
      if (!db.objectStoreNames.contains(CONFIG)) db.createObjectStore(CONFIG, { keyPath: 'clave' });
      if (!db.objectStoreNames.contains(LISTAS)) db.createObjectStore(LISTAS, { keyPath: 'listaId' });
      if (!db.objectStoreNames.contains(PAGOS)) {
        const s = db.createObjectStore(PAGOS, { keyPath: 'id' });
        s.createIndex('porCliente', 'claveCliente', { unique: false });
        s.createIndex('porLista', 'listaId', { unique: false });
      }
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
  return promesa;
}

function transaccion(almacen, modo, hacer) {
  return abrir().then((db) => new Promise((resolver, rechazar) => {
    const tx = db.transaction(almacen, modo);
    const pedido = hacer(tx.objectStore(almacen));
    tx.oncomplete = () => resolver(pedido ? pedido.result : undefined);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  }));
}

/** Guarda el avance de una lista. listaId es la fecha (2026-09-05). */
export function guardarAvance(listaId, avance) {
  return transaccion(AVANCE, 'readwrite', (s) => s.put({ listaId, ...avance, guardado: Date.now() }));
}

export function leerAvance(listaId) {
  return transaccion(AVANCE, 'readonly', (s) => s.get(listaId)).then((r) => r || null);
}

export function guardarConfig(clave, valor) {
  return transaccion(CONFIG, 'readwrite', (s) => s.put({ clave, valor }));
}

export function leerConfig(clave) {
  return transaccion(CONFIG, 'readonly', (s) => s.get(clave)).then((r) => (r ? r.valor : null));
}

/** Clave estable de un item dentro de una lista: no depende del orden de las filas. */
export function claveItem(pedido, item) {
  return pedido.claveCliente + '#' + item.columnaIndice;
}

// ---------- historial de listas ----------
/** Guarda lo mínimo de una lista para poder arrastrar saldos: quién, cuánto. */
export function guardarListaEnHistorial(listaId, resumen) {
  return transaccion(LISTAS, 'readwrite', (s) => s.put({ listaId, ...resumen, guardado: Date.now() }));
}

export function leerHistorial() {
  return transaccion(LISTAS, 'readonly', (s) => s.getAll()).then((r) => r || []);
}

export function borrarDelHistorial(listaId) {
  return transaccion(LISTAS, 'readwrite', (s) => s.delete(listaId));
}

// ---------- pagos ----------
export function clavePago(listaId, claveCliente) {
  return listaId + '|' + claveCliente;
}

export function guardarPago(pago) {
  return transaccion(PAGOS, 'readwrite', (s) => s.put({ ...pago, id: clavePago(pago.listaId, pago.claveCliente) }));
}

export function leerPagos() {
  return transaccion(PAGOS, 'readonly', (s) => s.getAll()).then((r) => r || []);
}

/** Todo lo guardado, para el respaldo en JSON. */
export async function exportarTodo() {
  const [listas, pagos, config] = await Promise.all([
    transaccion(LISTAS, 'readonly', (s) => s.getAll()),
    transaccion(PAGOS, 'readonly', (s) => s.getAll()),
    transaccion(CONFIG, 'readonly', (s) => s.getAll()),
  ]);
  const avances = await transaccion(AVANCE, 'readonly', (s) => s.getAll());
  return { version: 1, exportado: new Date().toISOString(), listas, pagos, config, avances };
}

/** Restaura un respaldo. Reemplaza lo que haya con la misma clave. */
export async function importarTodo(datos) {
  const cuenta = { listas: 0, pagos: 0, config: 0, avances: 0 };
  for (const [almacen, filas, nombre] of [
    [LISTAS, datos.listas, 'listas'], [PAGOS, datos.pagos, 'pagos'],
    [CONFIG, datos.config, 'config'], [AVANCE, datos.avances, 'avances'],
  ]) {
    for (const fila of filas || []) {
      await transaccion(almacen, 'readwrite', (s) => s.put(fila));
      cuenta[nombre]++;
    }
  }
  return cuenta;
}
