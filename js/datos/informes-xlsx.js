// Los tres informes en un solo .xlsx, para abrirlos en la compu.

import { armarXLSX } from './xlsx.js';
import { informeCosecha } from '../core/cosecha.js';
import { informePedidos } from '../core/pedidos.js';
import { informeCobros } from '../core/cobros.js';

export function hojaCosecha(lista, opciones) {
  const inf = informeCosecha(lista, opciones);
  const filas = [['Origen', 'Producto', 'Cantidad', 'Unidad', 'Con margen', 'Pedidos', 'Productor', 'Notas']];
  for (const g of inf.grupos) {
    for (const p of g.productos) {
      filas.push([g.etiqueta, p.nombreCorto, p.total, p.unidad, p.conMargen, p.pedidos, p.productor, p.notas.join(' / ')]);
    }
  }
  return { nombre: 'Cosecha', filas };
}

export function hojaPedidos(lista, opciones) {
  const inf = informePedidos(lista, opciones);
  const filas = [['Orden', 'Punto', 'Cliente', 'Teléfono', 'Producto', 'Cantidad', 'Unidad', 'Peso real', 'Precio', 'Estimado', 'Nota']];
  for (const punto of inf.puntos) {
    for (const pedido of punto.pedidos) {
      for (const item of pedido.items) {
        filas.push([
          punto.entrega, punto.etiqueta, pedido.nombre, pedido.telMostrado,
          item.nombreCorto, item.cantidad, item.unidad || item.unidadCol || '',
          item.pesoReal === null || item.pesoReal === undefined ? '' : item.pesoReal,
          item.precioFinal, item.estimado ? 'sí' : '', item.nota || '',
        ]);
      }
    }
  }
  return { nombre: 'Pedidos', filas };
}

export function hojaCobros(lista, opciones) {
  const inf = informeCobros(lista, opciones);
  const filas = [['Cliente', 'Teléfono', 'Punto', 'Total', 'Sin pesar', 'Mensaje']];
  for (const c of inf.cuentas) {
    filas.push([c.nombre, c.telMostrado, c.puntoCodigo || '', c.total, c.estimados || '', c.texto]);
  }
  filas.push([]);
  filas.push(['TOTAL', '', '', inf.total]);
  return { nombre: 'Cobros', filas };
}

/** Los tres informes juntos. */
export function informesAXLSX(lista, opciones = {}) {
  return armarXLSX([hojaCosecha(lista, opciones), hojaPedidos(lista, opciones), hojaCobros(lista, opciones)]);
}
