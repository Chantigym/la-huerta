// Informe B - LISTADO DE PEDIDOS: un paquete por persona, agrupado por punto
// de retiro y en el orden en que los vas a entregar.
//
// Ojo con el orden: la lista va en orden de ENTREGA, asi que el auto se carga
// al reves (lo que entregas primero tiene que quedar arriba de todo).

import { totalPedido } from './precios.js';

/**
 * @param {object} lista salida de armarLista
 * @param {object} opciones { ordenPuntos: ['MERLO', 'LA_PAZ', ...] }
 */
export function informePedidos(lista, opciones = {}) {
  const orden = opciones.ordenPuntos && opciones.ordenPuntos.length
    ? opciones.ordenPuntos
    : lista.puntos.map((p) => p.codigo);

  const posicion = new Map(orden.map((c, i) => [c, i]));
  const puntos = lista.puntos
    .slice()
    .sort((a, b) => (posicion.has(a.codigo) ? posicion.get(a.codigo) : 999) -
                    (posicion.has(b.codigo) ? posicion.get(b.codigo) : 999));

  const armados = puntos.map((punto, i) => {
    const pedidos = lista.pedidos.filter((p) => p.puntoCodigo === punto.codigo);
    return {
      ...punto,
      entrega: i + 1,                      // en que orden llegas
      carga: puntos.length - i,            // en que orden lo cargas al auto
      pedidos,
      totales: totalesPorProducto(pedidos),
      totalPlata: pedidos.reduce((a, p) => a + p.total, 0),
      itemsAPesar: pedidos.reduce((a, p) => a + p.items.filter((i2) => i2.sePesa).length, 0),
      itemsConNota: pedidos.reduce((a, p) => a + p.items.filter((i2) => i2.nota).length, 0),
    };
  });

  const sinPunto = lista.pedidos.filter((p) => !p.puntoCodigo);
  if (sinPunto.length) {
    armados.push({
      codigo: 'SIN_PUNTO', etiqueta: 'Sin punto de retiro', direccion: '', horario: '',
      entrega: armados.length + 1, carga: 1, pedidos: sinPunto,
      totales: totalesPorProducto(sinPunto),
      totalPlata: sinPunto.reduce((a, p) => a + p.total, 0),
      itemsAPesar: 0, itemsConNota: 0,
    });
  }

  return {
    fecha: lista.fecha,
    puntos: armados,
    totalPedidos: lista.pedidos.length,
    totalPlata: armados.reduce((a, p) => a + p.totalPlata, 0),
  };
}

/** Cuanto va en total a un punto, para cargar a granel y repartir alla. */
function totalesPorProducto(pedidos) {
  const mapa = new Map();
  for (const p of pedidos) {
    for (const it of p.items) {
      const k = it.columnaIndice;
      if (!mapa.has(k)) {
        mapa.set(k, { nombreCorto: it.nombreCorto, unidad: it.unidadCol || it.unidad || 'unidad', cantidad: 0 });
      }
      mapa.get(k).cantidad += it.cantidadCosecha || it.cantidad || 0;
    }
  }
  return [...mapa.values()]
    .map((t) => ({ ...t, cantidad: Math.round((t.cantidad + Number.EPSILON) * 100) / 100 }))
    .sort((a, b) => a.nombreCorto.localeCompare(b.nombreCorto, 'es'));
}

/** Recalcula el total de un pedido despues de cargar pesos. */
export function recalcularPedido(pedido) {
  pedido.total = totalPedido(pedido.items.map((i) => ({ precio: i.precioFinal })));
  return pedido.total;
}
