// Las seis pantallas. Cada una muestra una hoja limpia y guarda los ajustes
// plegados abajo: lo que se usa todos los días arriba, lo que se toca de vez
// en cuando adentro de "Ajustes".

import { leerPDF } from '../core/pdf-grilla.js';
import { leerCSV } from '../core/csv.js';
import { armarLista } from '../core/tabla.js';
import { cosechaPorFamilia, textoDeCosecha } from '../core/cosecha.js';
import { informePedidos, recalcularPedido } from '../core/pedidos.js';
import { informeCobros, linkWhatsApp, productosSinAlias, balancePorPunto, PLANTILLAS } from '../core/cobros.js';
import { ordenarParaBolsa } from '../core/categorias.js';
import { calcularItem, totalPedido } from '../core/precios.js';
import { moneda, fecha } from '../core/formato.js';
import { cuentaAJPG, nombreArchivo } from '../img/cuenta-jpg.js';
import { armarZip } from '../img/zip.js';
import { quienMeDebe, resumenParaHistorial, ESTADOS } from '../core/cuentacorriente.js';
import { informesAXLSX } from '../datos/informes-xlsx.js';
import { guardarAvance, leerAvance, guardarConfig, leerConfig, claveItem,
         guardarListaEnHistorial, leerHistorial, guardarPago, leerPagos,
         exportarTodo, importarTodo } from '../datos/db.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const crear = (tag, props = {}) => {
  const { dataset, ...resto } = props;
  const el = Object.assign(document.createElement(tag), resto);
  if (dataset) for (const [k, v] of Object.entries(dataset)) el.dataset[k] = v;
  return el;
};
const recortar = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
const plural = (n, uno, muchos) => `${n} ${n === 1 ? uno : muchos}`;

const estado = {
  lista: null, armado: null, cobros: null,
  tildados: new Set(),   // productos ya cosechados
  tildes: new Set(),     // ítems ya puestos en la bolsa
  pesos: new Map(),      // peso real por ítem
  enviadas: new Set(),   // cuentas ya mandadas
  ordenPuntos: [],
  arrastrado: null,
  alias: {},
  plantillas: null,
  historial: [],
  pagos: [],
};

// ---------- navegación ----------
function irA(vista) {
  $$('.vista').forEach((v) => { v.hidden = v.id !== 'vista-' + vista; });
  $$('.paso').forEach((p) => p.setAttribute('aria-current', String(p.dataset.vista === vista)));
  window.scrollTo({ top: 0, behavior: 'instant' });
}
$$('.paso').forEach((p) => p.addEventListener('click', () => {
  if (p.disabled) return;
  if (p.dataset.vista === 'deudas') refrescarDeudas();
  irA(p.dataset.vista);
}));

function habilitar(vista, si) {
  const p = $$('.paso').find((x) => x.dataset.vista === vista);
  if (p) p.disabled = !si;
}

// Guardar PDF: imprime solo la hoja de la pantalla en la que estás.
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-pdf]')) return;
  window.print();
});

// ---------- 1. cargar la lista ----------
const zona = $('#zona');
$('#btn-elegir').addEventListener('click', () => $('#archivo').click());
$('#archivo').addEventListener('change', (e) => { if (e.target.files[0]) cargar(e.target.files[0]); });

['dragenter', 'dragover'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); }));
['dragleave', 'drop'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); }));
zona.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) cargar(f); });

async function cargar(archivo) {
  const aviso = $('#estado-carga');
  aviso.textContent = 'Leyendo ' + archivo.name + '…';
  try {
    const esCSV = /\.(csv|tsv|txt)$/i.test(archivo.name);
    const { tabla, renglones, meta } = esCSV
      ? leerCSV(await archivo.text())
      : await leerPDF(await archivo.arrayBuffer());

    estado.lista = armarLista(tabla, renglones, archivo.name);
    estado.lista.meta = meta;
    estado.tildes = new Set();
    estado.tildados = new Set();
    estado.pesos = new Map();
    estado.enviadas = new Set();
    estado.ordenPuntos = estado.lista.puntos.map((p) => p.codigo);

    await recuperarConfig();
    await recuperarAvance();

    aviso.textContent = '';
    $('#dato-lista').textContent = 'lista del ' + fecha(estado.lista.fecha + 'T12:00:00');
    pintarRevision();
    habilitar('revision', true);
    irA('revision');
  } catch (err) {
    aviso.innerHTML = '';
    aviso.append(crear('div', { className: 'aviso mal', textContent: 'No pude leer el archivo: ' + err.message }));
  }
}

// ---------- 2. revisar ----------
function pintarRevision() {
  const L = estado.lista;
  const dudosas = L.pedidos.flatMap((p) =>
    p.items.filter((i) => i.confianza !== 'verde').map((i) => ({ pedido: p, item: i })));
  const rojas = dudosas.filter((d) => d.item.confianza === 'rojo').length;

  $('#cifras').innerHTML = '';
  const cifras = [
    ['pedidos', L.resumen.pedidos, ''],
    ['productos', L.resumen.productosConPedido, ''],
    ['puntos de retiro', L.puntos.length, ''],
    ['para revisar', L.resumen.celdasParaRevisar, rojas ? 'mal' : (L.resumen.celdasParaRevisar ? 'alerta' : '')],
  ];
  for (const [rot, val, clase] of cifras) {
    const c = crear('div', { className: 'cifra ' + clase });
    c.append(crear('b', { textContent: String(val) }), crear('span', { className: 'rotulo', textContent: rot }));
    $('#cifras').append(c);
  }

  const av = $('#alerta-revision');
  av.innerHTML = '';
  const caja = crear('div');
  if (rojas) {
    caja.className = 'aviso mal';
    caja.textContent = rojas === 1
      ? 'Hay 1 celda que no pude leer. Corregí el precio antes de seguir.'
      : `Hay ${rojas} celdas que no pude leer. Corregí los precios antes de seguir.`;
  } else if (dudosas.length) {
    caja.className = 'aviso revisar';
    caja.textContent = dudosas.length === 1
      ? 'Leí toda la lista. Hay 1 celda con algo raro: mirala antes de seguir.'
      : `Leí toda la lista. Hay ${dudosas.length} celdas con algo raro: miralas antes de seguir.`;
  } else {
    caja.className = 'aviso ok';
    caja.textContent = 'Se leyó toda la lista sin ambigüedades.';
  }
  av.append(caja);
  $('#btn-a-cosecha').disabled = rojas > 0;

  pintarPrecios();
  pintarDudosas(dudosas);
}

function pintarPrecios() {
  const L = estado.lista;
  const pedidas = new Set(L.pedidos.flatMap((p) => p.items.map((i) => i.columnaIndice)));
  const t = $('#tabla-precios');
  t.innerHTML = '<thead><tr><th>Producto</th><th>Unidad</th><th class="der">Precio</th>' +
    '<th class="der">Por kg</th><th>Origen</th></tr></thead>';
  const cuerpo = crear('tbody');

  for (const col of L.columnas) {
    if (!pedidas.has(col.indice)) continue;
    const tr = crear('tr');
    const tdN = crear('td', { dataset: { c: 'nombre' } });
    tdN.append(crear('div', { textContent: col.nombreCorto, style: 'font-weight:600' }),
               crear('div', { className: 'crudo', textContent: recortar(col.encabezadoCrudo, 62) }));
    if (col.precio === null) {
      tdN.append(crear('div', { className: 'crudo', textContent: 'el precio viene en la opción que eligió cada cliente' }));
    }
    tr.append(tdN, crear('td', { textContent: col.unidad || '—', dataset: { c: 'unidad' } }));
    tr.append(celdaPrecio(col, 'precio'), celdaPrecio(col, 'precioPorKg'));
    tr.append(crear('td', { textContent: col.productor ? recortar(col.productor, 26) : '—', dataset: { c: 'origen' } }));
    cuerpo.append(tr);
  }
  t.append(cuerpo);
}

/** Precio editable: al cambiarlo se recalculan todos los pedidos. */
function celdaPrecio(col, campo) {
  const td = crear('td', { className: 'der', dataset: { c: campo === 'precio' ? 'precio' : 'porkg' } });
  const input = crear('input', {
    className: 'campo', type: 'number', min: '0', step: '50', placeholder: '—',
    value: col[campo] === null || col[campo] === undefined ? '' : String(col[campo]),
  });
  input.setAttribute('aria-label', `${campo === 'precio' ? 'Precio' : 'Precio por kg'} de ${col.nombreCorto}`);
  input.addEventListener('change', () => {
    const v = input.value.trim();
    col[campo] = v === '' ? null : Number(v);
    input.classList.add('editado');
    recalcular();
    pintarRevision();
  });
  td.append(input);
  return td;
}

function recalcular() {
  const L = estado.lista;
  const porIndice = new Map(L.columnas.map((c) => [c.indice, c]));
  for (const p of L.pedidos) {
    for (const item of p.items) {
      const calc = calcularItem(item, porIndice.get(item.columnaIndice), item.pesoReal);
      item.precioFinal = calc.precio;
      item.estimado = calc.estimado;
      item.basePrecio = calc.base;
    }
    p.total = totalPedido(p.items.map((i) => ({ precio: i.precioFinal })));
  }
}

function pintarDudosas(dudosas) {
  $('#caja-dudosas').hidden = dudosas.length === 0;
  const t = $('#tabla-dudosas');
  t.innerHTML = '<thead><tr><th>Cliente</th><th>Producto</th><th>Puso</th><th>Qué pasa</th></tr></thead>';
  const cuerpo = crear('tbody');
  for (const { pedido, item } of dudosas) {
    const tr = crear('tr');
    const est = crear('td');
    est.append(crear('span', { className: 'punto ' + item.confianza }),
               crear('span', { textContent: ' ' + pedido.nombre }));
    tr.append(est, crear('td', { textContent: item.nombreCorto }));
    tr.append(crear('td', { className: 'crudo', textContent: item.textoCrudo }));
    tr.append(crear('td', { textContent: item.avisos.join(' ') }));
    cuerpo.append(tr);
  }
  t.append(cuerpo);
}

$('#btn-a-cosecha').addEventListener('click', () => {
  pintarCosecha();
  pintarArmado();
  pintarCobros();
  habilitar('cosecha', true);
  habilitar('armado', true);
  habilitar('cobros', true);
  irA('cosecha');
});

// ---------- 3. cosechar ----------
$('#margen').addEventListener('change', pintarCosecha);

function pintarCosecha() {
  if (!estado.lista) return;
  const margen = Math.max(0, Number($('#margen').value) || 0) / 100;
  const inf = cosechaPorFamilia(estado.lista, { margen });

  $('#fecha-cosecha').textContent = 'lista del ' + fecha(estado.lista.fecha + 'T12:00:00') +
    ' · ' + plural(inf.totalProductos, 'producto', 'productos');

  pintarTextoCosecha(inf);

  const hoja = $('#hoja-cosecha');
  hoja.innerHTML = '';

  for (const familia of inf.familias) {
    hoja.append(crear('h3', { className: 'familia', textContent: familia.etiqueta }));

    for (const grupo of familia.grupos) {
      // El nombre del proveedor solo hace falta si no es tuyo.
      hoja.append(crear('p', {
        className: 'proveedor',
        textContent: grupo.propia ? 'De tu chacra' : grupo.etiqueta,
      }));

      for (const p of grupo.productos) {
        const clave = 'cosecha:' + p.indice;
        const fila = crear('label', { className: 'renglon' });

        const tilde = crear('input', { type: 'checkbox', className: 'tilde', checked: estado.tildados.has(clave) });
        tilde.setAttribute('aria-label', 'Ya tengo ' + p.nombreCorto);
        tilde.addEventListener('change', () => {
          if (tilde.checked) estado.tildados.add(clave); else estado.tildados.delete(clave);
          guardarLuego();
        });

        // Número y unidad en columnas propias: así los nombres arrancan todos
        // a la misma altura y la lista se recorre con la vista.
        const num = crear('b', { className: 'renglon-num', textContent: String(p.total) });
        const uni = crear('i', { className: 'renglon-uni', textContent: p.unidad });

        const nombre = crear('span', { className: 'renglon-nombre', textContent: p.nombreCorto });
        if (grupo.propia && margen && p.conMargen !== p.total) {
          nombre.append(crear('span', { className: 'renglon-extra', textContent: ' cosechá ' + p.conMargen }));
        }

        fila.append(tilde, num, uni, nombre);
        hoja.append(fila);

        for (const nota of p.notas) {
          hoja.append(crear('p', { className: 'renglon-nota', textContent: nota }));
        }
      }
    }
  }
}

// ---------- 4. armar ----------
function pintarArmado() {
  if (!estado.lista) return;
  const inf = informePedidos(estado.lista, { ordenPuntos: estado.ordenPuntos });
  estado.armado = inf;
  estado.ordenPuntos = inf.puntos.map((p) => p.codigo);
  pintarRecorrido(inf);
  marcarAvance();

  const porColumna = new Map(estado.lista.columnas.map((c) => [c.indice, c]));
  const hoja = $('#hoja-armado');
  hoja.innerHTML = '';

  for (const punto of inf.puntos) {
    const tit = crear('h3', { className: 'familia', textContent: punto.etiqueta });
    tit.append(crear('span', { className: 'carga', textContent: 'carga ' + punto.carga }));
    hoja.append(tit);
    if (punto.direccion) hoja.append(crear('p', { className: 'proveedor', textContent: punto.direccion }));

    for (const pedido of punto.pedidos) hoja.append(fichaDePedido(pedido, porColumna));

    if (punto.totales.length) {
      hoja.append(crear('p', {
        className: 'total-punto',
        textContent: 'En total a ' + punto.etiqueta + ': ' +
          punto.totales.map((t) => `${t.cantidad} ${t.unidad} ${t.nombreCorto}`).join(' · '),
      }));
    }
  }
}

/** El paquete de una persona, en el orden en que se mete en la bolsa. */
function fichaDePedido(pedido, porColumna) {
  const ficha = crear('article', { className: 'ficha' });

  const tope = crear('div', { className: 'ficha-tope' });
  tope.append(crear('span', { className: 'quien', textContent: pedido.nombre }));
  const plata = crear('span', { className: 'plata' });
  tope.append(plata);
  ficha.append(tope);

  const refrescar = () => {
    recalcularPedido(pedido);
    plata.innerHTML = '';
    plata.append(crear('span', { textContent: moneda(pedido.total) }));
    const sinPesar = pedido.items.filter((i) => i.estimado).length;
    if (sinPesar) plata.append(crear('small', { textContent: plural(sinPesar, 'sin pesar', 'sin pesar') }));
    const todos = pedido.items.every((i) => estado.tildes.has(claveItem(pedido, i)));
    ficha.classList.toggle('lista', todos && pedido.items.length > 0);
  };

  // De lo más pesado a lo más liviano: la papa al fondo, los huevos arriba.
  for (const item of ordenarParaBolsa(pedido.items, porColumna)) {
    ficha.append(renglonDeItem(pedido, item, refrescar));
  }

  refrescar();
  return ficha;
}

function renglonDeItem(pedido, item, refrescar) {
  const clave = claveItem(pedido, item);
  const fila = crear('div', { className: 'item' });

  const tilde = crear('input', { type: 'checkbox', className: 'tilde', checked: estado.tildes.has(clave) });
  tilde.setAttribute('aria-label', `Ya puse ${item.nombreCorto} en la bolsa de ${pedido.nombre}`);
  tilde.addEventListener('change', () => {
    if (tilde.checked) estado.tildes.add(clave); else estado.tildes.delete(clave);
    refrescar();
    marcarAvance();
    guardarLuego();
  });

  const medio = crear('div');
  const nom = crear('div', { className: 'item-nombre' });
  nom.append(crear('b', { textContent: String(item.cantidad) }),
             crear('span', { textContent: ' ' + (item.unidad || item.unidadCol || '') + ' · ' + item.nombreCorto }));
  medio.append(nom);
  if (item.nota) medio.append(crear('div', { className: 'nota', textContent: item.nota }));

  const precio = crear('div', { className: 'item-precio' + (item.estimado ? ' estimado' : '') });
  precio.textContent = moneda(item.precioFinal);
  item._pintarPrecio = () => {
    precio.textContent = moneda(item.precioFinal);
    precio.classList.toggle('estimado', Boolean(item.estimado));
  };

  fila.append(tilde, medio);
  if (item.sePesa) fila.append(balanzaDe(pedido, item, refrescar));
  fila.append(precio);
  return fila;
}

/** Peso real. Teclado numérico y el precio se recalcula al toque. */
function balanzaDe(pedido, item, refrescar) {
  const clave = claveItem(pedido, item);
  const caja = crear('div', { className: 'balanza' });
  const id = 'peso-' + clave.replace(/[^a-zA-Z0-9]/g, '');

  const campo = crear('input', {
    id, type: 'number', inputMode: 'decimal', step: '0.005', min: '0', placeholder: '—',
    value: item.pesoReal === null || item.pesoReal === undefined ? '' : String(item.pesoReal),
  });
  campo.classList.toggle('cargado', item.pesoReal > 0);

  const aplicar = () => {
    const v = campo.value.trim();
    item.pesoReal = v === '' ? null : Number(v.replace(',', '.'));
    if (item.pesoReal !== null) estado.pesos.set(clave, item.pesoReal);
    else estado.pesos.delete(clave);

    const col = estado.lista.columnas.find((c) => c.indice === item.columnaIndice);
    const calc = calcularItem(item, col, item.pesoReal);
    item.precioFinal = calc.precio;
    item.estimado = calc.estimado;
    campo.classList.toggle('cargado', item.pesoReal > 0);
    if (item._pintarPrecio) item._pintarPrecio();
    refrescar();
    guardarLuego();
    pintarCobros();
  };
  campo.addEventListener('change', aplicar);
  campo.addEventListener('blur', aplicar);

  campo.setAttribute('aria-label', `Cuánto pesó ${item.nombreCorto} de ${pedido.nombre}, en kilos`);
  caja.append(campo, crear('span', { className: 'unidad-peso', textContent: 'kg' }));
  return caja;
}

function marcarAvance() {
  if (!estado.lista) return;
  const total = estado.lista.pedidos.reduce((a, p) => a + p.items.length, 0);
  $('#avance-armado').textContent = `${estado.tildes.size} de ${total} ítems listos`;
}

/** Orden del recorrido: se mueve con flechas, que en el celular es lo único
 *  que funciona con una mano ocupada. */
function pintarRecorrido(inf) {
  const ol = $('#recorrido');
  ol.innerHTML = '';
  inf.puntos.forEach((punto, i) => {
    const li = crear('li');
    li.append(crear('span', { className: 'nombre-punto', textContent: punto.entrega + '. ' + punto.etiqueta }));
    li.append(crear('span', {
      className: 'rotulo cuenta',
      textContent: `${plural(punto.pedidos.length, 'pedido', 'pedidos')} · carga ${punto.carga}`,
    }));
    const moveres = crear('span', { className: 'moveres' });
    for (const [texto, destino, apagado] of [['↑', i - 1, i === 0], ['↓', i + 1, i === inf.puntos.length - 1]]) {
      const b = crear('button', { className: 'mover', textContent: texto, disabled: apagado });
      b.setAttribute('aria-label', (texto === '↑' ? 'Entregar antes: ' : 'Entregar después: ') + punto.etiqueta);
      b.addEventListener('click', () => mover(i, destino));
      moveres.append(b);
    }
    li.append(moveres);
    ol.append(li);
  });
}

function mover(desde, hasta) {
  const orden = estado.ordenPuntos.slice();
  const [x] = orden.splice(desde, 1);
  orden.splice(hasta, 0, x);
  estado.ordenPuntos = orden;
  pintarArmado();
  pintarCobros();
  guardarLuego();
}

// ---------- 5. cobrar ----------
for (const [id, campo] of [['#pl-saludo', 'saludo'], ['#pl-cierre', 'cierre'], ['#pl-alias', 'aliasTransferencia']]) {
  $(id).addEventListener('input', () => {
    estado.plantillas[campo] = $(id).value;
    guardarConfig('plantillas', estado.plantillas).catch(() => {});
    pintarCobros();
  });
}

function pintarCobros() {
  if (!estado.lista) return;
  const inf = informeCobros(estado.lista, {
    alias: estado.alias, plantillas: estado.plantillas, ordenPuntos: estado.ordenPuntos,
  });
  estado.cobros = inf;

  $('#resumen-cobros').textContent = `${plural(inf.cuentas.length, 'cuenta', 'cuentas')} · ${moneda(inf.total)}`;

  // Sin alias de transferencia, el mensaje sale sin la línea para pagar.
  const avisoAlias = $('#aviso-alias');
  avisoAlias.innerHTML = '';
  if (!estado.plantillas.aliasTransferencia) {
    const a = crear('button', {
      className: 'aviso revisar aviso-tocable',
      textContent: 'Falta tu alias para transferir. Tocá acá para cargarlo.',
    });
    a.addEventListener('click', () => {
      const ajustes = $('#vista-cobros .ajustes');
      ajustes.open = true;
      $('#pl-alias').focus();
      ajustes.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    avisoAlias.append(a);
  }

  const hoja = $('#hoja-cobros');
  hoja.innerHTML = '';
  inf.cuentas.forEach((cuenta, i) => hoja.append(tarjetaDeCuenta(cuenta, i, inf.cuentas.length, hoja)));
  pintarAlias();
}

/** Una cuenta: el mensaje tal cual se manda, y dos botones. Al copiar, baja
 *  sola al siguiente que falta, así se van despachando de arriba abajo. */
function tarjetaDeCuenta(cuenta, i, total, hoja) {
  const caja = crear('article', { className: 'cuenta' });
  if (estado.enviadas.has(cuenta.claveCliente)) caja.classList.add('enviada');

  const tope = crear('div', { className: 'cuenta-tope' });
  tope.append(crear('span', { className: 'nro', textContent: `${i + 1}/${total}` }));
  tope.append(crear('span', { className: 'quien', textContent: cuenta.nombre }));
  if (cuenta.telMostrado) tope.append(crear('span', { className: 'tel', textContent: cuenta.telMostrado }));
  tope.append(crear('span', { className: 'plata', textContent: moneda(cuenta.total) }));
  caja.append(tope);

  caja.append(crear('pre', { className: 'mensaje', textContent: cuenta.texto }));

  const marcar = () => {
    estado.enviadas.add(cuenta.claveCliente);
    caja.classList.add('enviada');
    guardarLuego();
  };

  const acciones = crear('div', { className: 'acciones no-imprime' });
  const copiar = crear('button', { className: 'boton fantasma', textContent: 'Copiar' });
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cuenta.texto);
      copiar.textContent = 'Copiado';
    } catch {
      // Sin permiso de portapapeles: al menos dejamos el texto seleccionado.
      const r = document.createRange();
      r.selectNodeContents(caja.querySelector('.mensaje'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      copiar.textContent = 'Copialo vos';
    }
    marcar();
    const siguiente = [...hoja.querySelectorAll('.cuenta')].slice(i + 1)
      .find((c) => !c.classList.contains('enviada'));
    if (siguiente) siguiente.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { copiar.textContent = 'Copiar'; }, 2000);
  });
  acciones.append(copiar);

  const link = linkWhatsApp(cuenta);
  if (link) {
    const wa = crear('a', { className: 'boton', href: link, target: '_blank', rel: 'noopener', textContent: 'WhatsApp' });
    wa.addEventListener('click', marcar);
    acciones.append(wa);
  }
  caja.append(acciones);
  return caja;
}

/** Los nombres cortos que van en el mensaje, adentro de Ajustes. */
function pintarAlias() {
  const productos = productosSinAlias(estado.lista, {});
  const cont = $('#lista-alias');
  cont.innerHTML = '';
  if (!productos.length) return;

  const usados = new Map();
  for (const p of productos) {
    const v = (estado.alias[p.clave] || p.sugerido).toLowerCase();
    usados.set(v, (usados.get(v) || 0) + 1);
  }

  cont.append(crear('p', { className: 'rotulo', textContent: 'Cómo se llaman en el mensaje' }));
  for (const p of productos) {
    const valor = estado.alias[p.clave] || p.sugerido;
    const chocan = usados.get(valor.toLowerCase()) > 1;

    const fila = crear('div', { className: 'alias-fila' });
    const de = crear('div', { className: 'de' });
    de.append(crear('span', { textContent: p.nombreCorto }));
    if (chocan) de.append(crear('small', { textContent: 'otro producto se llama igual' }));

    const campo = crear('input', { type: 'text', value: valor, placeholder: p.sugerido });
    campo.setAttribute('aria-label', 'Cómo llamás a ' + p.nombreCorto);
    if (estado.alias[p.clave]) campo.classList.add('guardado');
    if (chocan) campo.classList.add('choca');
    campo.addEventListener('change', () => {
      const v = campo.value.trim();
      if (!v || v === valor) return;
      estado.alias[p.clave] = v;
      guardarConfig('aliasProductos', estado.alias).catch(() => {});
      pintarCobros();
    });

    fila.append(de, campo);
    cont.append(fila);
  }
}

// ---------- 6. me deben ----------
async function refrescarDeudas() {
  try {
    estado.historial = await leerHistorial();
    estado.pagos = await leerPagos();
  } catch { estado.historial = []; estado.pagos = []; }
  pintarDeudas();
}

function pintarDeudas() {
  const inf = quienMeDebe(estado.historial, estado.pagos);
  const partes = [plural(estado.historial.length, 'lista guardada', 'listas guardadas')];
  if (inf.total) partes.push('deben ' + moneda(inf.total));
  if (inf.aFavor) partes.push(moneda(inf.aFavor) + ' a favor');
  $('#resumen-deudas').textContent = partes.join(' · ');

  const aviso = $('#aviso-historial');
  aviso.innerHTML = '';
  aviso.append(crear('p', {
    style: 'margin:0',
    textContent: !estado.lista
      ? 'Cargá una lista para poder guardarla en el historial.'
      : estado.historial.some((l) => l.listaId === estado.lista.fecha)
        ? `La lista del ${fecha(estado.lista.fecha + 'T12:00:00')} ya está guardada. Si la volvés a guardar, se actualiza.`
        : `La lista del ${fecha(estado.lista.fecha + 'T12:00:00')} todavía no está guardada. Guardala cuando termines de cobrar.`,
  }));

  const cont = $('#listado-deudas');
  cont.innerHTML = '';
  if (!inf.deudores.length) {
    const vacio = crear('div', { className: 'caja vacio' });
    vacio.append(crear('b', { textContent: estado.historial.length ? 'No te debe nadie' : 'Todavía no hay historial' }));
    vacio.append(crear('span', {
      textContent: estado.historial.length
        ? 'Todas las cuentas guardadas están pagadas.'
        : 'Guardá una lista después de cobrar y acá vas a ver quién quedó debiendo.',
    }));
    cont.append(vacio);
    return;
  }
  for (const d of inf.deudores) cont.append(fichaDeudor(d));
}

function fichaDeudor(d) {
  const caja = crear('article', { className: 'deudor' });
  const tope = crear('div', { className: 'deudor-tope' });
  tope.append(crear('span', { className: 'quien', textContent: d.nombre }));
  if (d.telMostrado) tope.append(crear('span', { className: 'tel', textContent: d.telMostrado }));
  const monto = crear('span', { className: d.debe < 0 ? 'debe afavor' : 'debe' });
  monto.textContent = d.debe < 0 ? moneda(-d.debe) + ' a favor' : moneda(d.debe);
  tope.append(monto);
  caja.append(tope);

  const listas = crear('div', { className: 'deudor-listas' });
  for (const l of d.listas) {
    const fila = crear('div', { className: 'deudor-lista' });
    fila.append(crear('span', { textContent: fecha(l.fecha + 'T12:00:00') }));

    const grupo = crear('div', { className: 'estados' });
    for (const est of ESTADOS) {
      const b = crear('button', { type: 'button', textContent: est, dataset: { estado: est } });
      b.setAttribute('aria-pressed', String(l.estado === est));
      b.setAttribute('aria-label', `${d.nombre}, ${fecha(l.fecha + 'T12:00:00')}: marcar ${est}`);
      b.addEventListener('click', async () => {
        await guardarPago({
          listaId: l.listaId, claveCliente: d.claveCliente, estado: est,
          monto: est === 'pagada' ? l.total : 0, fecha: new Date().toISOString().slice(0, 10),
        });
        await refrescarDeudas();
      });
      grupo.append(b);
    }
    fila.append(grupo, crear('span', { className: 'monto', textContent: moneda(l.debe) }));
    listas.append(fila);
  }
  caja.append(listas);
  return caja;
}

$('#btn-guardar-historial').addEventListener('click', async () => {
  const boton = $('#btn-guardar-historial');
  if (!estado.lista) { boton.textContent = 'Cargá una lista primero'; return; }
  if (!estado.cobros) pintarCobros();
  boton.textContent = 'Guardando…';
  try {
    await guardarListaEnHistorial(estado.lista.fecha, resumenParaHistorial(estado.lista, estado.cobros));
    await refrescarDeudas();
    boton.textContent = 'Guardada';
  } catch { boton.textContent = 'No pude guardar'; }
  setTimeout(() => { boton.textContent = 'Guardar esta lista'; }, 2500);
});

// ---------- lo que se guarda solo ----------
// El avance se guarda apenas cambia: esto se usa parado al lado del auto y el
// celular se apaga cuando quiere.
let guardadoPendiente = null;
function guardarLuego() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(() => {
    if (!estado.lista) return;
    guardarAvance(estado.lista.fecha, {
      tildes: [...estado.tildes],
      pesos: Object.fromEntries(estado.pesos),
      ordenPuntos: estado.ordenPuntos,
      cosechados: [...estado.tildados],
      enviadas: [...estado.enviadas],
    }).catch(() => {});
  }, 350);
}

async function recuperarConfig() {
  try {
    estado.alias = (await leerConfig('aliasProductos')) || {};
    estado.plantillas = { ...PLANTILLAS, ...((await leerConfig('plantillas')) || {}) };
  } catch {
    estado.alias = {};
    estado.plantillas = { ...PLANTILLAS };
  }
  $('#pl-saludo').value = estado.plantillas.saludo;
  $('#pl-cierre').value = estado.plantillas.cierre;
  $('#pl-alias').value = estado.plantillas.aliasTransferencia;
}

async function recuperarAvance() {
  try {
    const g = await leerAvance(estado.lista.fecha);
    if (!g) return;
    estado.tildes = new Set(g.tildes || []);
    estado.tildados = new Set(g.cosechados || []);
    estado.enviadas = new Set(g.enviadas || []);
    estado.pesos = new Map(Object.entries(g.pesos || {}));
    if (g.ordenPuntos && g.ordenPuntos.length) estado.ordenPuntos = g.ordenPuntos;
    for (const p of estado.lista.pedidos) {
      for (const item of p.items) {
        const peso = estado.pesos.get(claveItem(p, item));
        if (peso !== undefined && peso !== null && peso !== '') item.pesoReal = Number(peso);
      }
    }
    recalcular();
  } catch { /* si no hay base, se arranca de cero */ }
}

// ---------- respaldo ----------
function decirRespaldo(texto, clase = 'ok') {
  const el = $('#estado-respaldo');
  el.innerHTML = '';
  el.append(crear('div', { className: 'aviso ' + clase, textContent: texto }));
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = crear('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

$('#btn-exportar').addEventListener('click', async () => {
  try {
    const todo = await exportarTodo();
    descargar(new Blob([JSON.stringify(todo, null, 2)], { type: 'application/json' }),
      `lahuerta-respaldo-${new Date().toISOString().slice(0, 10)}.json`);
    decirRespaldo(`Bajado: ${todo.listas.length} listas, ${todo.pagos.length} pagos y tus alias.`);
  } catch (e) { decirRespaldo('No pude armar el respaldo: ' + e.message, 'mal'); }
});

$('#btn-importar').addEventListener('click', () => $('#archivo-respaldo').click());

$('#archivo-respaldo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    const datos = JSON.parse(await archivo.text());
    if (!datos || typeof datos !== 'object' || !('listas' in datos)) {
      throw new Error('Ese archivo no parece un respaldo de La Huerta.');
    }
    const cuenta = await importarTodo(datos);
    await recuperarConfig();
    await refrescarDeudas();
    if (estado.lista) pintarCobros();
    decirRespaldo(`Cargado: ${cuenta.listas} listas, ${cuenta.pagos} pagos, ${cuenta.config} preferencias.`);
  } catch (err) { decirRespaldo('No pude cargar el respaldo: ' + err.message, 'mal'); }
  e.target.value = '';
});

$('#btn-xlsx').addEventListener('click', () => {
  const boton = $('#btn-xlsx');
  if (!estado.lista) { decirRespaldo('Cargá una lista para poder exportar los informes.', 'revisar'); return; }
  boton.textContent = 'Armando…';
  try {
    descargar(informesAXLSX(estado.lista, {
      margen: Math.max(0, Number($('#margen').value) || 0) / 100,
      ordenPuntos: estado.ordenPuntos, alias: estado.alias, plantillas: estado.plantillas,
    }), `lahuerta-informes-${estado.lista.fecha}.xlsx`);
    decirRespaldo('Bajado el Excel con las tres hojas: Cosecha, Pedidos y Cobros.');
  } catch (e) { decirRespaldo('No pude armar el Excel: ' + e.message, 'mal'); }
  boton.textContent = 'Informes en Excel';
});

/** Todas las cuentas como imagen, en un zip. */
$('#btn-zip').addEventListener('click', async () => {
  const boton = $('#btn-zip');
  if (!estado.cobros) return;
  const cuentas = estado.cobros.cuentas;
  const opciones = { fechaLista: estado.lista.fecha, aliasTransferencia: estado.plantillas.aliasTransferencia };
  const archivos = [];
  try {
    for (let i = 0; i < cuentas.length; i++) {
      boton.textContent = `Armando ${i + 1} de ${cuentas.length}…`;
      const blob = await cuentaAJPG(cuentas[i], opciones);
      archivos.push({
        nombre: nombreArchivo(cuentas[i], estado.lista.fecha),
        datos: new Uint8Array(await blob.arrayBuffer()),
      });
      await new Promise((r) => setTimeout(r, 0));
    }
    descargar(armarZip(archivos), `cuentas_${estado.lista.fecha}.zip`);
    boton.textContent = `${archivos.length} imágenes descargadas`;
  } catch {
    boton.textContent = 'No pude armar las imágenes';
  }
  setTimeout(() => { boton.textContent = 'Bajar todas como imagen'; }, 3000);
});

// Punto de entrada para desarrollo y para las páginas de prueba de test/.
window.laHuerta = { cargar, estado, irA, pintarCosecha, pintarArmado, pintarCobros, pintarBalance, refrescarDeudas };

/** Balance: los totales solos, sin los mensajes. Se arma al pedir el PDF. */
function pintarBalance() {
  const inf = estado.cobros;
  const hoja = $('#hoja-balance');
  hoja.innerHTML = '';

  const enc = crear('div', { className: 'balance-encabezado' });
  enc.append(crear('h3', { textContent: 'Balance' }));
  enc.append(crear('span', {
    className: 'rotulo',
    textContent: 'lista del ' + fecha(estado.lista.fecha + 'T12:00:00'),
  }));
  hoja.append(enc);

  const balance = balancePorPunto(inf, estado.lista.puntos);

  for (const grupo of balance.grupos) {
    hoja.append(crear('p', { className: 'balance-punto', textContent: grupo.etiqueta }));

    for (const cuenta of grupo.cuentas) {
      const fila = crear('div', { className: 'balance-fila' });
      fila.append(crear('span', { className: 'quien', textContent: cuenta.nombre }));
      if (cuenta.telMostrado) fila.append(crear('span', { className: 'tel', textContent: cuenta.telMostrado }));
      fila.append(crear('span', { className: 'monto', textContent: moneda(cuenta.total) }));
      hoja.append(fila);
    }

    const sub = crear('div', { className: 'balance-fila subtotal' });
    sub.append(crear('span', { className: 'quien', textContent: plural(grupo.cuentas.length, 'pedido', 'pedidos') }));
    sub.append(crear('span', { className: 'monto', textContent: moneda(grupo.total) }));
    hoja.append(sub);
  }

  const total = crear('div', { className: 'balance-total' });
  total.append(crear('b', { textContent: 'Total de la semana' }));
  total.append(crear('span', { className: 'rotulo', textContent: plural(balance.cuentas, 'cuenta', 'cuentas') }));
  total.append(crear('span', { className: 'monto', textContent: moneda(balance.total) }));
  hoja.append(total);
}

$('#btn-balance').addEventListener('click', () => {
  if (!estado.cobros) pintarCobros();
  pintarBalance();
  document.body.classList.add('imprimir-balance');
  window.print();
  setTimeout(() => document.body.classList.remove('imprimir-balance'), 500);
});

/** El texto de la cosecha, para copiar y mandar. */
function pintarTextoCosecha(inf) {
  $('#texto-cosecha').textContent = textoDeCosecha(inf, estado.alias);
}

$('#btn-copiar-cosecha').addEventListener('click', async () => {
  const boton = $('#btn-copiar-cosecha');
  const texto = $('#texto-cosecha').textContent;
  try {
    await navigator.clipboard.writeText(texto);
    boton.textContent = 'Copiado';
  } catch {
    // Sin permiso de portapapeles: al menos queda seleccionado para copiar a mano.
    const r = document.createRange();
    r.selectNodeContents($('#texto-cosecha'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    boton.textContent = 'Copialo vos';
  }
  setTimeout(() => { boton.textContent = 'Copiar'; }, 2000);
});
