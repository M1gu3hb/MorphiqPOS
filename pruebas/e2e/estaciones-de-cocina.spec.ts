import { randomInt } from 'node:crypto';

import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

import { CARTA } from './ayudantes/mesas-heredadas.ts';
import { Equipo, opcionesDelProyecto } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  entrar,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * DP-10.1 · CADA ESTACIÓN VE LO SUYO: Cocina la comida, la barra las bebidas, el dueño todo.
 *
 * En producción (27-10) el único usuario de cocina veía comida y bebidas revueltas, y encender
 * las estaciones lo dejaba con la pantalla VACÍA y sin aviso: la sesión del navegador no traía
 * su estación. Aquí la dueña enciende las estaciones, manda las bebidas a la Barra y da de alta
 * a tres cocineros —uno de la general, uno de la Barra y uno sin estación— con PIN de prueba.
 * Cada uno entra con su PIN y ve lo suyo; al recargar lo sigue viendo; el aviso de un pedido
 * nuevo sale sólo en la pantalla de su estación.
 */

const SLUG = 'demo-acople-restaurante';
const MESA = 6;

interface Estacion {
  readonly id: string;
  readonly nombre: string;
  readonly es_general?: boolean;
}

async function escribir(duena: Page, ruta: string, datos: Record<string, unknown>) {
  const respuesta = await duena.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: datos,
  });
  const texto = await respuesta.text();
  expect(respuesta.status(), `${ruta}: ${texto.slice(0, 300)}`).toBe(200);
  return JSON.parse(texto) as { readonly datos?: Record<string, unknown> };
}

async function productoId(duena: Page, nombre: string): Promise<string> {
  const productos = await consultarPuente<{ id: string; nombre: string }>(
    duena,
    'ProductoTerminado',
    { limite: 80 },
  );
  const producto = productos.find((p) => p.nombre === nombre);
  expect(producto, `La siembra no trae «${nombre}».`).toBeDefined();
  return producto?.id ?? '';
}

interface Cocinero {
  readonly pagina: Page;
  readonly empleoId: string;
}

/** Un cocinero nuevo, con un PIN de prueba al azar, que ENTRA en su propio navegador. */
async function cocineroQueEntra(
  browser: Browser,
  info: TestInfo,
  duena: Page,
  nombre: string,
  estacion: Estacion | null,
): Promise<Cocinero> {
  const pin = String(randomInt(1000, 10_000));
  const alta = await escribir(duena, '/api/identidad/empleados', {
    nombre,
    puesto: 'cocina',
    estacionPreparacionId: estacion?.id ?? null,
    pin,
  });
  const contexto = await browser.newContext(opcionesDelProyecto(info));
  const pagina = await contexto.newPage();
  await entrar(pagina, { slug: SLUG, nombre, pin });
  return { pagina, empleoId: String(alta.datos?.['empleoId']) };
}

/** Lo que dice el SERVIDOR de la sesión de esa pestaña. */
async function sesionDe(pagina: Page): Promise<Record<string, unknown>> {
  const respuesta = await pagina.request.get('/api/catalogo/sesion');
  expect(respuesta.status()).toBe(200);
  return ((await respuesta.json()) as { datos: Record<string, unknown> }).datos;
}

async function pedir(duena: Page, ordenId: string, platillos: readonly string[]) {
  await escribir(duena, '/api/restaurante/enviar-pedido', {
    ordenId,
    lineas: await Promise.all(
      platillos.map(async (nombre) => ({
        productoId: await productoId(duena, nombre),
        cantidad: '1',
      })),
    ),
  });
}

test.describe('estaciones de cocina', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('Cocina ve la comida, la Barra las bebidas, el dueño todo; sin estación, el aviso', async ({
    browser,
  }, info) => {
    test.setTimeout(5 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const abiertas: Page[] = [];
    const fallos: (() => void)[] = [];
    // Lo que enseña una pantalla de Cocina: cuántas comandas tiene y cuáles platillos. En el
    // teléfono la tarjeta sale compacta y no enseña sus platillos: ahí cuenta el número.
    const ensena = async (
      pagina: Page,
      que: {
        readonly activos: number;
        readonly si: readonly string[];
        readonly no: readonly string[];
      },
    ): Promise<void> => {
      await expect(pagina.getByText(`${String(que.activos)} pedido(s) activos`)).toBeVisible();
      if (info.project.name === 'telefono') return;
      for (const nombre of que.si) await expect(pagina.getByText(nombre).first()).toBeVisible();
      for (const nombre of que.no) await expect(pagina.getByText(nombre)).toHaveCount(0);
    };
    const COMIDA = CARTA.guacamole.nombre;
    const BEBIDA = CARTA.limonada.nombre;
    try {
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      const reseteo = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(reseteo.status(), `resetear: ${await reseteo.text()}`).toBe(200);

      const estaciones = await consultarPuente<Estacion>(duena, 'EstacionPreparacion', {
        limite: 20,
      });
      const general = estaciones.find((e) => e.es_general === true);
      const barra = estaciones.find((e) => e.nombre === 'Barra');
      if (general === undefined || barra === undefined) {
        throw new Error('La siembra no trae la estación general y la Barra.');
      }

      await test.step('la dueña manda bebidas y cervezas a la Barra y enciende las estaciones', async () => {
        const deLaBarra = (
          await consultarPuente<{ id: string; nombre: string }>(duena, 'CategoriaProducto', {
            limite: 50,
          })
        ).filter((c) => c.nombre === 'Bebidas' || c.nombre === 'Cervezas');
        expect(deLaBarra).toHaveLength(2);
        for (const categoria of deLaBarra) {
          await escribir(duena, '/api/datos/escribir', {
            entidad: 'CategoriaProducto',
            operacion: 'update',
            id: categoria.id,
            datos: { estacion_preparacion_id: barra.id },
          });
        }
        await escribir(duena, '/api/datos/escribir', {
          entidad: 'ConfiguracionNegocio',
          operacion: 'update',
          datos: { estaciones_preparacion_activas: true },
        });
      });

      const [mesa] = await consultarPuente<{ id: string }>(duena, 'Mesa', {
        filtro: { numero: MESA },
        limite: 1,
      });
      const apertura = await escribir(duena, '/api/restaurante/abrir-mesa', {
        mesaId: mesa?.id,
        personas: 2,
      });
      const ordenId = String(apertura.datos?.['ordenId']);
      await pedir(duena, ordenId, [CARTA.guacamole.nombre, CARTA.limonada.nombre]);

      const deComida = await cocineroQueEntra(browser, info, duena, 'Comida E2E', general);
      const deBarra = await cocineroQueEntra(browser, info, duena, 'Barra E2E', barra);
      const deNinguna = await cocineroQueEntra(browser, info, duena, 'Sin estación E2E', null);
      const [comida, tragos, sinEstacion] = [deComida.pagina, deBarra.pagina, deNinguna.pagina];
      abiertas.push(comida, tragos, sinEstacion);
      for (const pagina of abiertas) fallos.push(vigilarFallos(pagina));

      await test.step('al entrar con su PIN, cada cocinero cae en Cocina y ve lo suyo', async () => {
        // Sin recargar: la pantalla decide con lo que contestó el PIN.
        await expect(comida).toHaveURL(/\/cocina$/);
        await ensena(comida, { activos: 1, si: [COMIDA], no: [BEBIDA] });
        await expect(tragos).toHaveURL(/\/cocina$/);
        await ensena(tragos, { activos: 1, si: [BEBIDA], no: [COMIDA] });
      });

      await test.step('la sesión del servidor trae la estación de cada quien', async () => {
        expect(await sesionDe(comida)).toMatchObject({
          estacion_preparacion_id: general.id,
          puede_ver_todas_estaciones: false,
        });
        expect(await sesionDe(tragos)).toMatchObject({ estacion_preparacion_id: barra.id });
        expect(await sesionDe(duena)).toMatchObject({ puede_ver_todas_estaciones: true });
      });

      await test.step('cada pantalla de Cocina enseña lo suyo', async () => {
        await comida.goto('/cocina');
        await ensena(comida, { activos: 1, si: [COMIDA], no: [BEBIDA] });
        await tragos.goto('/cocina');
        await ensena(tragos, { activos: 1, si: [BEBIDA], no: [COMIDA] });
        await duena.goto('/cocina');
        await ensena(duena, { activos: 2, si: [COMIDA, BEBIDA], no: [] });
      });

      await test.step('el cocinero sin estación ve el aviso, nunca una lista vacía', async () => {
        await sinEstacion.goto('/cocina');
        await expect(
          sinEstacion.getByText(
            'Tu usuario no tiene estación asignada; pide al administrador que te asigne una.',
          ),
        ).toBeVisible();
        await expect(sinEstacion.getByText(COMIDA)).toHaveCount(0);
        await expect(sinEstacion.getByText(/pedido\(s\) activos/)).toHaveCount(0);
      });

      await test.step('al recargar, cada quien conserva su estación', async () => {
        await comida.reload();
        await ensena(comida, { activos: 1, si: [COMIDA], no: [BEBIDA] });
        await expect(comida.getByText(general.nombre).first()).toBeVisible();
      });

      await test.step('le asignan la Barra a quien no tenía: al recargar la ve, sin volver a entrar', async () => {
        await escribir(duena, '/api/identidad/empleados', {
          empleado: deNinguna.empleoId,
          nombre: 'Sin estación E2E',
          puesto: 'cocina',
          estacionPreparacionId: barra.id,
        });
        await sinEstacion.reload();
        await ensena(sinEstacion, { activos: 1, si: [BEBIDA], no: [COMIDA] });
      });

      await test.step('el pedido nuevo de la barra se anuncia sólo en la Barra', async () => {
        await pedir(duena, ordenId, [CARTA.cerveza.nombre]);
        await expect(tragos.getByText('Nuevo pedido recibido')).toBeVisible({ timeout: 15_000 });
        await ensena(tragos, { activos: 2, si: [CARTA.cerveza.nombre], no: [COMIDA] });
        await ensena(comida, { activos: 1, si: [COMIDA], no: [CARTA.cerveza.nombre] });
        await expect(comida.getByText('Nuevo pedido recibido')).toHaveCount(0);
      });

      await test.step('la Barra sólo conecta el teléfono de la Barra', async () => {
        await tragos.getByRole('button', { name: 'Conectar teléfono' }).click();
        const dialogo = tragos.getByRole('dialog', { name: 'Conectar teléfono' });
        await expect(dialogo.getByRole('button', { name: barra.nombre })).toBeVisible();
        await expect(dialogo.getByRole('button', { name: general.nombre })).toHaveCount(0);
      });

      for (const sinFallos of fallos) sinFallos();
    } finally {
      for (const pagina of abiertas) await pagina.context().close();
      await equipo.cerrar();
    }
  });
});
