// A qué familia pertenece cada producto y en qué orden va.
//
// Se usa para dos cosas distintas:
//  - la COSECHA se agrupa por familia: verdura, fruta, huevos y almacén;
//  - el ARMADO se ordena por peso, de lo más pesado a lo más liviano, que es
//    el orden en el que la bolsa se arma sin que se aplaste nada.

import { sinAcentos } from './formato.js';

export const FAMILIAS = ['verdura', 'fruta', 'huevos', 'almacen'];

export const ETIQUETA_FAMILIA = {
  verdura: 'Verdura',
  fruta: 'Fruta',
  huevos: 'Huevos',
  almacen: 'Almacén',
};

const VERDURA = /papa|batata|repollo|radicheta|escarola|lechuga|perejil|nabo|acelga|puerro|remolacha|zanahoria|cebolla|ajo\b|tomate|zapallo|zapallito|zucchini|zuccini|espinaca|rucula|brocoli|coliflor|apio|cilantro|albahaca|kale|chaucha|arveja|haba\b|choclo|maiz\s+dulce|berenjena|pimiento|morron|aji\s+fresco|rabanito|rabano|hinojo|penca|cardo|verdeo|repollito|nabiza|mostaza|achicoria|endivia|pepino|calabaza|batata|papines|hierba|planta|plantin|brote|germinado/;
const FRUTA = /palta|pomelo|mandarina|naranja|limon|lima\b|manzana|pera\b|banana|frutilla|uva|durazno|higo|membrillo|kiwi|melon|sandia|damasco|cereza|granada|caqui|nispero|arandano|mora\b|frambuesa|ciruela|tuna\b|chirimoya|mamon|anana|ananá|papaya|guayaba|maracuya|pelon|nectarin/;
const HUEVOS = /huevo/;

/**
 * A qué familia pertenece una columna de producto.
 * Ojo con las conservas: los zuccinis agridulces y los pepinos en conserva
 * vienen en frasco y son almacén, no verdura.
 */
export function familiaDe(col) {
  const texto = sinAcentos(`${col.nombreCorto || ''} ${col.encabezadoCrudo || ''}`).toLowerCase();

  if (HUEVOS.test(texto)) return 'huevos';
  // Lo que viene en frasco ya está elaborado: chucrut, dulce, miel, encurtidos.
  if (col.unidad === 'frasco' || /conserva|encurtid|agridulce|en\s+salmuera/.test(texto)) return 'almacen';
  if (FRUTA.test(texto)) return 'fruta';
  if (VERDURA.test(texto)) return 'verdura';
  return 'almacen';
}

/**
 * Orden para armar la bolsa: primero lo que aguanta peso encima, al final lo
 * que se rompe. Los huevos van arriba de todo.
 */
const ORDEN_BOLSA = [
  { rango: 10, re: /papa|batata|zapallo|calabaza/ },
  { rango: 20, re: /pomelo|naranja|mandarina|limon|lima\b|melon|sandia/ },
  { rango: 30, re: /palta|manzana|pera\b|banana|naranja|membrillo|granada/ },
  { rango: 40, re: /repollo|choclo|coliflor|brocoli/ },
  { rango: 50, re: /nabo|zanahoria|cebolla|ajo\b|rabanito|rabano/ },
  { rango: 55, re: /remolacha/ },
  { rango: 60, re: /puerro|verdeo|apio|hinojo|penca|cardo/ },
  { rango: 65, re: /chaucha|arveja|haba\b|zapallito|zucchini|zuccini|pepino|berenjena|pimiento|morron/ },
  { rango: 68, re: /tomate/ },
  { rango: 70, re: /acelga|espinaca|nabiza|kale/ },
  { rango: 80, re: /radicheta|rucula|mostaza|escarola|achicoria|endivia/ },
  { rango: 90, re: /lechuga|repollito|brote|germinado/ },
  { rango: 95, re: /frutilla|frambuesa|mora\b|arandano|cereza|higo|uva\b/ },
  { rango: 100, re: /perejil|cilantro|albahaca|hierba|flor|plantin|planta/ },
];

const RESTO_VERDURA = 110;
const RESTO_FRUTA = 120;
const ALMACEN = 200;
const HUEVOS_ARRIBA = 300;

/** Número que ordena un producto adentro de la bolsa. Más chico = más abajo. */
export function ordenDeBolsa(col) {
  const familia = familiaDe(col);
  if (familia === 'huevos') return HUEVOS_ARRIBA;
  if (familia === 'almacen') return ALMACEN;

  const texto = sinAcentos(`${col.nombreCorto || ''} ${col.encabezadoCrudo || ''}`).toLowerCase();
  const encontrado = ORDEN_BOLSA.find((o) => o.re.test(texto));
  if (encontrado) return encontrado.rango;
  return familia === 'fruta' ? RESTO_FRUTA : RESTO_VERDURA;
}

/** Ordena una lista de ítems como se arma la bolsa. */
export function ordenarParaBolsa(items, columnaPorIndice) {
  return items.slice().sort((a, b) => {
    const ca = columnaPorIndice.get(a.columnaIndice) || a;
    const cb = columnaPorIndice.get(b.columnaIndice) || b;
    return ordenDeBolsa(ca) - ordenDeBolsa(cb) ||
      String(a.nombreCorto).localeCompare(String(b.nombreCorto), 'es');
  });
}
