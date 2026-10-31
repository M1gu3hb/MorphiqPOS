/**
 * QUÉ MESAS SE PINTAN EN UN MAPA, y en qué zona.
 *
 * ── Por qué es un módulo y no tres `.filter()` sueltos ─────────────────────
 * El mapa del mesero, el editor de Configuración → Mesas y la pantalla nueva de mesas
 * decidían por su cuenta qué dibujar. Los tres tenían la misma trampa: una mesa dada de
 * baja (`activo === false`) conserva su posición, y en el restaurante real cuatro mesas
 * inactivas tienen EXACTAMENTE las coordenadas de cuatro activas. Basta que una lista con
 * inactivas llegue a un mapa —un caché de otra pantalla, una lectura sin filtro— para que
 * aparezcan mesas encimadas, y nada en el dibujo lo delata: es una mesa más, en su sitio.
 *
 * Aquí vive la regla en una función que se puede probar: el mapa recibe SÓLO mesas
 * activas y SÓLO las de la zona que se mira, y lo que no cumple no se pinta, venga de
 * donde venga.
 *
 * Es TypeScript a propósito: `heredado/` no tiene pruebas (ni las puede tener), y esta
 * regla es de las que hay que poder ver fallar.
 */

/** La zona de una mesa que no la declara, tal como la pintaban el mapa y el editor. */
export const ZONA_POR_OMISION = 'Interior';

/** Lo mínimo que estas reglas leen de una mesa: el resto de sus campos les da igual. */
export interface MesaDelPlano {
  readonly id: string;
  readonly activo?: boolean | null | undefined;
  readonly zona?: string | null | undefined;
  readonly posicion_x?: number | null | undefined;
  readonly posicion_y?: number | null | undefined;
}

/** `activo` ausente cuenta como activa: sólo `false` es baja, igual que en el editor. */
export function estaEnServicio(mesa: Pick<MesaDelPlano, 'activo'>): boolean {
  return mesa.activo !== false;
}

export function zonaDeLaMesa(mesa: Pick<MesaDelPlano, 'zona'>): string {
  const zona = mesa.zona;
  return typeof zona === 'string' && zona.trim() !== '' ? zona : ZONA_POR_OMISION;
}

/** Las mesas dadas de baja, fuera. Devuelve una lista nueva. */
export function soloMesasEnServicio<T extends Pick<MesaDelPlano, 'activo'>>(
  mesas: readonly T[],
): readonly T[] {
  return mesas.filter(estaEnServicio);
}

/**
 * Lo que se dibuja en el plano de UNA zona: en servicio y de esa zona.
 *
 * Las coordenadas se repiten ENTRE zonas (la Terraza tiene una mesa en (140, 140) y el
 * Interior otra), así que dibujar dos zonas en el mismo lienzo las encima sí o sí.
 */
export function mesasDelPlano<T extends Pick<MesaDelPlano, 'activo' | 'zona'>>(
  mesas: readonly T[],
  zona: string,
): readonly T[] {
  return soloMesasEnServicio(mesas).filter((mesa) => zonaDeLaMesa(mesa) === zona);
}

/** Lo que se lee de una zona dada de alta (`Zona` del puente). */
export interface ZonaDelNegocio {
  readonly nombre?: string | null | undefined;
  readonly orden?: number | null | undefined;
  readonly activo?: boolean | null | undefined;
}

/**
 * LAS ZONAS DEL NEGOCIO (DP-5): las que tiene dadas de alta, por su orden y sin las apagadas, y
 * después las que sólo aparecen en sus mesas. Sin ninguna leída, la lista de siempre (`porOmision`,
 * la `ZONAS_MESA` del heredado) seguida de las de sus mesas.
 *
 * Las pantallas del salón sólo conocían esa lista fija: una mesa en «Salón» —la zona de Don
 * Poncho— no salía en el mapa del mesero ni en el editor, y una mesa nueva nacía en «Interior»,
 * que el negocio no tiene, y no se podía guardar.
 */
export function zonasDelNegocio(
  zonas: readonly ZonaDelNegocio[],
  mesas: readonly Pick<MesaDelPlano, 'zona'>[],
  porOmision: readonly string[],
): readonly string[] {
  const dadasDeAlta = zonas
    .filter(
      (z): z is ZonaDelNegocio & { readonly nombre: string } =>
        z.activo !== false && typeof z.nombre === 'string' && z.nombre.trim() !== '',
    )
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((z) => z.nombre);
  const base = dadasDeAlta.length > 0 ? dadasDeAlta : [...porOmision];
  const conocidas = new Set(base);
  const deSusMesas: string[] = [];
  for (const mesa of mesas) {
    const zona = zonaDeLaMesa(mesa);
    if (conocidas.has(zona)) continue;
    conocidas.add(zona);
    deSusMesas.push(zona);
  }
  return [...base, ...deSusMesas];
}

/**
 * Las zonas que de verdad tienen mesas en servicio, en el orden de `zonasConocidas`.
 * Una pestaña de una zona vacía —o que sólo tiene bajas— es una trampa.
 */
export function zonasConMesas(
  mesas: readonly Pick<MesaDelPlano, 'activo' | 'zona'>[],
  zonasConocidas: readonly string[],
): readonly { readonly zona: string; readonly cuantas: number }[] {
  return zonasConocidas
    .map((zona) => ({ zona, cuantas: mesasDelPlano(mesas, zona).length }))
    .filter((entrada) => entrada.cuantas > 0);
}

/**
 * El lienzo del editor: sus dimensiones y la rejilla en la que nace una mesa nueva.
 *
 * `ALTO_DEL_LIENZO` es el `MAP_HEIGHT` de `MesaMapEditor` y de `Mesero`; la caja de una mesa
 * existente se toma del tamaño MÁS GRANDE que admite (`TAMANOS_MESA`: 120 × 100), porque aquí
 * sólo importa no caer encima de ninguna, sea del tamaño que sea.
 */
export const LIENZO = {
  alto: 600,
  margen: 60,
  columnas: 8,
  pasoX: 90,
  pasoY: 100,
  /** Lo que ocupa la mesa nueva: la `mediana` redonda con la que nace el diálogo. */
  nueva: { ancho: 80, alto: 80 },
  /** Lo que se le reserva a una mesa que ya está puesta. */
  existente: { ancho: 120, alto: 100 },
} as const;

/**
 * Dónde nace una mesa nueva: el primer hueco de la rejilla en el que no cae encima de otra
 * mesa en servicio de esa zona.
 *
 * Antes era `60 + (cuántas % 8) * 90` —por el NÚMERO de mesas de la zona—, y eso pone la mesa
 * nueva sobre otra en cuanto alguien movió las suyas a mano o quitó una del medio: con
 * seis mesas colocadas por el dueño, la séptima nacía en la rejilla de fábrica, en un punto
 * que ya ocupaba una de ellas. El mesero la veía encimada desde el primer día.
 *
 * Si la rejilla visible está llena, cae donde caía antes (por la cuenta), fuera de la vista,
 * y el dueño la arrastra.
 */
export function siguientePosicionLibre(mesasDeLaZona: readonly MesaDelPlano[]): {
  readonly x: number;
  readonly y: number;
} {
  const puestas = soloMesasEnServicio(mesasDeLaZona);
  const filasVisibles = Math.floor((LIENZO.alto - LIENZO.margen) / LIENZO.pasoY);
  for (let indice = 0; indice < filasVisibles * LIENZO.columnas; indice += 1) {
    const x = LIENZO.margen + (indice % LIENZO.columnas) * LIENZO.pasoX;
    const y = LIENZO.margen + Math.floor(indice / LIENZO.columnas) * LIENZO.pasoY;
    if (!caeSobreAlgunaMesa(x, y, puestas)) return { x, y };
  }
  return {
    x: LIENZO.margen + (puestas.length % LIENZO.columnas) * LIENZO.pasoX,
    y: LIENZO.margen + Math.floor(puestas.length / LIENZO.columnas) * LIENZO.pasoY,
  };
}

/** ¿Una mesa nueva puesta en (x, y) quedaría encima de alguna de estas? */
export function caeSobreAlgunaMesa(x: number, y: number, mesas: readonly MesaDelPlano[]): boolean {
  return mesas.some((otra) => {
    const ox = otra.posicion_x ?? 100;
    const oy = otra.posicion_y ?? 100;
    return (
      x < ox + LIENZO.existente.ancho &&
      x + LIENZO.nueva.ancho > ox &&
      y < oy + LIENZO.existente.alto &&
      y + LIENZO.nueva.alto > oy
    );
  });
}

/** Dos mesas pintadas en el mismo punto: lo que el mesero ve como «mesas encimadas». */
export interface ParEncimado {
  readonly a: string;
  readonly b: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Los pares de mesas que quedarían dibujadas exactamente en el mismo punto.
 *
 * No se usa para pintar: es el instrumento con el que las pruebas (y quien mire una base
 * real) comprueban que un lienzo no tiene encimadas. Una mesa sin posición se pinta en
 * (100, 100), como hace `MesaShape`, de modo que varias mesas sin posición también cuentan.
 */
export function mesasEncimadas(mesas: readonly MesaDelPlano[]): readonly ParEncimado[] {
  const porPunto = new Map<string, string[]>();
  for (const mesa of mesas) {
    const x = mesa.posicion_x ?? 100;
    const y = mesa.posicion_y ?? 100;
    const punto = `${String(x)},${String(y)}`;
    porPunto.set(punto, [...(porPunto.get(punto) ?? []), mesa.id]);
  }
  const pares: ParEncimado[] = [];
  for (const [punto, ids] of porPunto) {
    const [x = 0, y = 0] = punto.split(',').map(Number);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i];
        const b = ids[j];
        if (a !== undefined && b !== undefined) pares.push({ a, b, x, y });
      }
    }
  }
  return pares;
}
