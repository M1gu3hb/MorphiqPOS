import { expect, type Page } from '@playwright/test';

import {
  abrirCajaPorLaRuta,
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  soltarLaCaja,
} from './sesion.ts';

/**
 * LAS MESAS DE LA DEMO, EN CADA UNO DE SUS ESTADOS.
 *
 * Una mesa de restaurante tiene diez estados en la base (`ESTADOS_MESA`,
 * `packages/app/src/restaurante/transiciones.ts`) y el servidor sólo escribe ocho:
 * `pagada` y `cancelada` existen como etiqueta en `MESA_STATUS_CONFIG` pero ningún comando
 * los deja en `mesas.estado` —la cuenta pagada manda a la mesa a `limpieza`, y cancelar la
 * deja `libre`—, así que ninguna pantalla puede enseñarlos y esto no los fabrica.
 *
 * Cada mesa se lleva a su estado POR LOS MISMOS COMANDOS que usan las pantallas —abrir,
 * enviar a cocina, «Preparar» y «Listo» de la cocina, entregar, pedir la cuenta, cobrar—, con
 * la sesión de la dueña, que los puede todos. Es la jornada de `dia-completo-restaurante`
 * parada en cada escalón en vez de recorrida entera.
 */

/** Los ocho estados que una mesa alcanza, en el orden de su ciclo, con su etiqueta del código. */
export const CICLO_DE_LA_MESA = [
  { clave: 'libre', etiqueta: 'Libre' },
  { clave: 'esperando_orden', etiqueta: 'Esperando orden' },
  { clave: 'pedido_enviado', etiqueta: 'Pedido enviado' },
  { clave: 'en_preparacion', etiqueta: 'En preparación' },
  { clave: 'en_espera_entrega', etiqueta: 'Esperando entrega' },
  { clave: 'ocupada', etiqueta: 'Ocupada' },
  { clave: 'cuenta_solicitada', etiqueta: 'Cuenta solicitada' },
  { clave: 'limpieza', etiqueta: 'Limpieza' },
] as const;

export type EstadoDeMesa = (typeof CICLO_DE_LA_MESA)[number]['clave'];

/** Qué mesa de la demo se deja en qué estado. */
export interface MesaPorPoner {
  readonly numero: number;
  readonly estado: EstadoDeMesa;
}

/**
 * La demo del restaurante tiene doce mesas en tres zonas: Interior (1-6), Terraza (7-9) y
 * Barra (10-12). Las dos chicas de Interior (3 y 6, de 60 px) llevan las dos etiquetas más
 * largas —«Cuenta solicitada» y «Esperando entrega»—, que es donde una etiqueta de 8 px se
 * parte en dos renglones y puede salirse del círculo.
 *
 * Los ocho estados caben en dos zonas: seis en Interior, y `limpieza` y `libre` en Terraza.
 */
export const MESAS_POR_PONER: readonly MesaPorPoner[] = [
  { numero: 1, estado: 'ocupada' },
  { numero: 2, estado: 'pedido_enviado' },
  { numero: 3, estado: 'cuenta_solicitada' },
  { numero: 4, estado: 'en_preparacion' },
  { numero: 5, estado: 'esperando_orden' },
  { numero: 6, estado: 'en_espera_entrega' },
  { numero: 7, estado: 'limpieza' },
  { numero: 8, estado: 'libre' },
];

export interface MesaPuesta extends MesaPorPoner {
  readonly mesaId: string;
  readonly ordenId: string | null;
  readonly zona: string;
}

interface Cuerpo {
  readonly ok?: boolean;
  readonly datos?: Record<string, unknown>;
}

/** Un comando por su ruta HTTP, con las cabeceras de una escritura, exigiendo el 200. */
async function mandar(page: Page, ruta: string, datos: Record<string, unknown>): Promise<Cuerpo> {
  const respuesta = await page.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: datos,
  });
  const texto = await respuesta.text();
  expect(
    respuesta.status(),
    `${ruta} contestó ${String(respuesta.status())}: ${texto.slice(0, 300)}`,
  ).toBe(200);
  return JSON.parse(texto) as Cuerpo;
}

const PLATILLO_DE_LA_COCINA = 'Guacamole con totopos';

/** El orden en que un estado se alcanza; sirve para decidir hasta dónde se avanza. */
const PASO = Object.fromEntries(CICLO_DE_LA_MESA.map((e, i) => [e.clave, i])) as Record<
  EstadoDeMesa,
  number
>;

/**
 * Pone cada mesa en su estado. Devuelve dónde quedó cada una, para limpiarlas después.
 *
 * Si la mesa ya no está libre —una corrida que murió a medias— falla diciéndolo: seguir sobre
 * mesas ocupadas mediría un escenario distinto del que la prueba cree tener.
 */
export async function ponerLasMesas(
  duena: Page,
  plan: readonly MesaPorPoner[] = MESAS_POR_PONER,
): Promise<readonly MesaPuesta[]> {
  const mesas = await consultarPuente<Record<string, unknown>>(duena, 'Mesa', { limite: 60 });
  const platillos = await consultarPuente<Record<string, unknown>>(duena, 'ProductoTerminado', {
    limite: 80,
  });
  const platillo = platillos.find((p) => p['nombre'] === PLATILLO_DE_LA_COCINA);
  expect(
    platillo,
    `La demo no tiene «${PLATILLO_DE_LA_COCINA}»: no hay con qué armar la comanda.`,
  ).toBeDefined();

  const puestas: MesaPuesta[] = [];
  let cajaAbierta = false;
  try {
    for (const { numero, estado } of plan) {
      const mesa = mesas.find((m) => m['numero'] === numero);
      expect(mesa, `La demo no tiene la mesa ${String(numero)}.`).toBeDefined();
      const mesaId = String(mesa?.['id']);
      const zonaDeLaMesa = mesa?.['zona'];
      const zona = typeof zonaDeLaMesa === 'string' ? zonaDeLaMesa : 'Interior';
      expect(
        mesa?.['estado'],
        `La mesa ${String(numero)} no está libre (${String(mesa?.['estado'])}): una corrida anterior ` +
          'dejó la demo a medias. Vuelve a sembrarla con `scripts/sembrar-demos.mjs --solo demo-acople-restaurante`.',
      ).toBe('libre');

      const paso = PASO[estado];
      if (paso === 0) {
        puestas.push({ numero, estado, mesaId, ordenId: null, zona });
        continue;
      }

      // libre → esperando_orden
      const apertura = await mandar(duena, '/api/restaurante/abrir-mesa', { mesaId, personas: 2 });
      const ordenId = String(apertura.datos?.['ordenId']);
      puestas.push({ numero, estado, mesaId, ordenId, zona });
      if (paso === PASO.esperando_orden) continue;

      // → pedido_enviado
      await mandar(duena, '/api/restaurante/enviar-pedido', {
        ordenId,
        lineas: [{ productoId: String(platillo?.['id']), cantidad: '1' }],
      });
      if (paso === PASO.pedido_enviado) continue;

      const comandas = await consultarPuente<Record<string, unknown>>(duena, 'PedidoPreparacion', {
        filtro: { venta_id: ordenId },
        limite: 10,
      });
      expect(comandas.length, `La mesa ${String(numero)} no generó comandas.`).toBeGreaterThan(0);

      // → en_preparacion (la cocina toca «Preparar»)
      for (const comanda of comandas) {
        await mandar(duena, '/api/restaurante/transicionar-pedido', {
          comandaId: String(comanda['id']),
          estado: 'en_preparacion',
        });
      }
      if (paso === PASO.en_preparacion) continue;

      // → en_espera_entrega (la cocina toca «Listo»)
      for (const comanda of comandas) {
        await mandar(duena, '/api/restaurante/transicionar-pedido', {
          comandaId: String(comanda['id']),
          estado: 'listo',
        });
      }
      if (paso === PASO.en_espera_entrega) continue;

      // → ocupada (la mesera entrega)
      await mandar(duena, '/api/restaurante/entregar-pedidos', { ordenId });
      if (paso === PASO.ocupada) continue;

      // → cuenta_solicitada
      const cuenta = await mandar(duena, '/api/restaurante/solicitar-cuenta', {
        ordenId,
        propinaTipo: 'sin_propina',
      });
      if (paso === PASO.cuenta_solicitada) continue;

      // → limpieza (se cobra): hace falta la caja abierta de esta terminal
      if (!cajaAbierta) {
        await abrirCajaPorLaRuta(duena, 50_000);
        cajaAbierta = true;
      }
      const total = Number(cuenta.datos?.['totalCentavos']);
      await mandar(duena, '/api/venta/cobrar', {
        ordenId,
        pagos: [{ metodo: 'efectivo', montoCentavos: total, recibidoCentavos: total }],
        totalEsperadoCentavos: total,
      });
    }
  } catch (error) {
    // Lo que alcanzó a ponerse se devuelve antes de reventar: dejar mesas sentadas es dejar la
    // demo sucia para quien corra después.
    await devolverLasMesas(duena, puestas);
    throw error;
  } finally {
    if (cajaAbierta) await soltarLaCaja(duena);
  }

  // Y se comprueba en el servidor, no en lo que las respuestas dijeron.
  const ahora = await consultarPuente<Record<string, unknown>>(duena, 'Mesa', { limite: 60 });
  for (const p of puestas) {
    expect(
      ahora.find((m) => m['numero'] === p.numero)?.['estado'],
      `La mesa ${String(p.numero)} debía quedar «${p.estado}» y el servidor dice otra cosa.`,
    ).toBe(p.estado);
  }
  return puestas;
}

/**
 * Devuelve las mesas a `libre` y la demo a como estaba: la mesa recogida, con «mesa limpia»; la
 * que tiene cuenta abierta, cancelando la cuenta (sin consumo cobrado no hay nada que devolver).
 * No lanza: es limpieza, y una limpieza que revienta tapa el fallo que hay que leer. Devuelve lo
 * que no pudo.
 */
export async function devolverLasMesas(
  duena: Page,
  puestas: readonly MesaPuesta[],
): Promise<readonly string[]> {
  const pendientes: string[] = [];
  for (const mesa of puestas) {
    if (mesa.estado === 'libre') continue;
    try {
      const ruta = '/api/restaurante/liberar-mesa';
      const respuesta = await duena.request.post(ruta, {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { mesaId: mesa.mesaId },
      });
      if (respuesta.status() === 200) continue;
      // Con consumo en la mesa, liberar se niega: se cancela la cuenta con su motivo y se libera.
      if (mesa.ordenId !== null) {
        await duena.request.post('/api/restaurante/cancelar-orden', {
          headers: cabecerasDeEscrituraDePrueba(),
          data: { ordenId: mesa.ordenId, motivo: 'Prueba de estados de mesa' },
        });
        const otra = await duena.request.post(ruta, {
          headers: cabecerasDeEscrituraDePrueba(),
          data: { mesaId: mesa.mesaId },
        });
        if (otra.status() === 200) continue;
      }
      pendientes.push(`mesa ${String(mesa.numero)} (${mesa.estado}) sigue ocupada`);
    } catch (error) {
      pendientes.push(
        `mesa ${String(mesa.numero)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return pendientes;
}
