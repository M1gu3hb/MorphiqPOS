import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorDominio, ROLES } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { liquidarPropinas } from '../propinas/liquidar.ts';
import { consultar } from './consultar.ts';
import { entidadMapeada, MAPA } from './mapa.ts';
import { rolMH } from './roles.ts';

const TODAS_LAS_ENTIDADES = [...Object.keys(MAPA), 'DescuentoInventarioVenta'] as const;
const FUENTE_MAPA =
  process.env['MORPHIQPOS_MAPA_SOURCE_PATH'] ??
  fileURLToPath(new URL('./mapa.ts', import.meta.url));
const FUENTE_CONSULTAR =
  process.env['MORPHIQPOS_CONSULTAR_SOURCE_PATH'] ??
  fileURLToPath(new URL('./consultar.ts', import.meta.url));
const FUENTE_TIPOS =
  process.env['MORPHIQPOS_PUENTE_TIPOS_SOURCE_PATH'] ??
  fileURLToPath(new URL('./tipos.ts', import.meta.url));

function rolesDe(entidad: string): readonly string[] {
  return entidadMapeada(entidad)?.rolesLectura ?? [];
}

function rolesDelCampo(entidad: string, campo: string): readonly string[] {
  const mapa = entidadMapeada(entidad);
  return (
    mapa?.campos[campo]?.rolesLectura ??
    mapa?.derivados?.[campo]?.rolesLectura ??
    mapa?.calculados?.[campo]?.rolesLectura ??
    []
  );
}

describe('B-4 · autorización explícita del puente de lectura', () => {
  it('el tipo y el lector hacen obligatoria y efectiva la política', () => {
    expect(readFileSync(FUENTE_TIPOS, 'utf8')).toContain(
      'readonly rolesLectura: readonly string[];',
    );
    expect(readFileSync(FUENTE_CONSULTAR, 'utf8')).toContain(
      'if (!mapa.rolesLectura.includes(ambito.rol))',
    );
  });

  it('el mapa mantiene explícitas las restricciones sensibles', () => {
    const codigo = readFileSync(FUENTE_MAPA, 'utf8');
    expect(codigo).toMatch(
      /CorteCaja:\s*{\s*tabla: 'sesiones_caja',\s*rolesLectura: \[\.\.\.CAJA\]/,
    );
    expect(codigo).toMatch(/qr_token:\s*\{\s*rolesLectura: \[\.\.\.DIRECCION\]/);
    expect(codigo).toMatch(/IntegrationSyncLog:\s*\{[\s\S]{0,200}?escritura: 'lectura'/);
  });

  it('cada entidad declara una lista no vacía de roles válidos', () => {
    const sinPolitica: string[] = [];
    for (const entidad of TODAS_LAS_ENTIDADES) {
      const roles = rolesDe(entidad);
      if (roles.length === 0 || roles.some((rol) => !(ROLES as readonly string[]).includes(rol))) {
        sinPolitica.push(entidad);
      }
    }

    expect(sinPolitica).toEqual([]);
  });

  it.each([
    ['CorteCaja', 'cocina'],
    ['CorteCaja', 'mesero'],
    ['GastoOperativo', 'cocina'],
    ['GastoOperativo', 'mesero'],
    ['CompraInsumo', 'cocina'],
    ['CompraInsumo', 'mesero'],
    ['LiquidacionPropina', 'cocina'],
    ['LiquidacionPropina', 'mesero'],
    ['Proveedor', 'cocina'],
    ['Proveedor', 'mesero'],
  ])('rechaza %s para el rol %s antes de consultar la base', async (entidad, rol) => {
    const promesa = consultar(
      { organizacionId: '11111111-1111-4111-8111-111111111111', rol },
      { entidad, operacion: 'list' },
    );

    await expect(promesa).rejects.toMatchObject<Partial<ErrorDominio>>({
      codigo: 'PUENTE_SIN_PERMISO',
    });
  });

  it('Venta no selecciona importes para cocina ni mesero', () => {
    for (const campo of ['total', 'subtotal', 'descuentos', 'impuestos', 'propina_porcentaje']) {
      const roles = rolesDelCampo('Venta', campo);
      expect(roles, `Venta.${campo}`).toContain('dueno');
      expect(roles, `Venta.${campo}`).not.toContain('cocina');
      expect(roles, `Venta.${campo}`).not.toContain('mesero');
    }
  });

  it('los tokens de mesa no salen a roles operativos', () => {
    for (const [entidad, campo] of [
      ['Mesa', 'qr_token'],
      ['SolicitudQR', 'token_mesa'],
    ] as const) {
      const roles = rolesDelCampo(entidad, campo);
      expect(roles, `${entidad}.${campo}`).toContain('dueno');
      for (const rol of ['cajero', 'mesero', 'cocina', 'almacen']) {
        expect(roles, `${entidad}.${campo} · ${rol}`).not.toContain(rol);
      }
    }
  });

  it('C-6 · la vista de consumo conserva la política del costo del ledger', () => {
    const politicaLedger = rolesDelCampo('MovimientoInventario', 'costo_unitario_en_momento');
    const politicaVista = rolesDelCampo('DescuentoInventarioVenta', 'costo_unitario_snapshot');

    expect(politicaVista).toEqual(politicaLedger);
    expect(politicaVista).not.toContain('cocina');
    expect(politicaVista).not.toContain('mesero');

    const codigo = readFileSync(FUENTE_MAPA, 'utf8');
    expect(codigo).toMatch(
      /const DESCUENTO_INVENTARIO_VENTA[\s\S]{0,900}?costo_unitario_snapshot:\s*\{\s*rolesLectura: \[\.\.\.VE_COSTOS_DE_INSUMO\]/,
    );
  });
});

/** La copia porteada del frontend. Se lee como DATOS, nunca se importa. */
const HEREDADO = fileURLToPath(new URL('../../../../apps/web/heredado/', import.meta.url));
const EXTENSIONES = new Set(['.js', '.jsx', '.ts', '.tsx']);

/** Rutas relativas a `heredado/`, con `/` en los dos sistemas operativos. */
function codigoHeredado(carpeta: string = HEREDADO): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) salida.push(...codigoHeredado(ruta));
    else if (EXTENSIONES.has(extname(entrada.name))) salida.push(ruta);
  }
  return salida;
}

function heredadosQueContienen(texto: string): string[] {
  return codigoHeredado()
    .filter((ruta) => readFileSync(ruta, 'utf8').includes(texto))
    .map((ruta) => relative(HEREDADO, ruta).replaceAll('\\', '/'))
    .sort();
}

/**
 * §7.5 · QUIÉN PUEDE SABER QUE UNA PROPINA YA SE LIQUIDÓ.
 *
 * `F2.3-REGLAS §7.5` da por supuesto que `rolesLectura: [...DIRECCION]` sobre
 * `propina_liquidada` deja a un cajero viendo «Pendiente» sobre propinas que sí
 * estaban liquidadas. Se comprobó y el supuesto no se sostiene: ese panel no es
 * suyo. Sólo lo pintan `PropinasDashboardSection` y `PropinasRegistros`, que
 * viven en `Dashboard` y en `Registros`, y `permissions.js` reserva las dos
 * pantallas a `ROLES.ADMIN` — que en el vocabulario de esta base son los tres de
 * la dirección. `propinas/liquidar.ts` ya declaraba esos mismos tres roles
 * citando las mismas dos líneas. Así que el campo no se tocó.
 *
 * Esto no fija una corrección: fija la decisión, porque se puede romper en dos
 * direcciones y las dos hacen daño.
 *
 *   · **Estrecharlo** —dejarlo en `['dueno']`, por ejemplo— produce el síntoma
 *     que §7.5 describe, sólo que al gerente: el panel dice «Pendiente» sobre
 *     propinas que sí están liquidadas, se vuelven a liquidar y el mesero cobra
 *     dos veces lo mismo.
 *   · **Ensancharlo a caja** «para que eso no pase» es el error simétrico, y es
 *     el que este hueco invitaba a cometer. `rolesLectura` es lo ÚNICO que
 *     separa al cajero de ese dato: ninguna ruta de `apps/web` tiene guarda de
 *     rol —la barra lateral sólo esconde el botón (ver `roles.ts`)— y la
 *     pestaña de propinas se pinta entera a quien escriba `/registros` en la
 *     barra de direcciones.
 *
 * Por eso el campo se ata AL COMANDO y no a una lista escrita a mano aquí:
 * «quién liquida» y «quién puede ver si ya se liquidó» son la misma pregunta, y
 * con una sola respuesta no se pueden separar por descuido.
 */
describe('§7.5 · el estado de liquidación de la propina', () => {
  /** El puntero, su fecha y el booleano derivado: los tres dicen lo mismo. */
  const CAMPOS = ['propina_liquidada', 'propina_liquidacion_id', 'propina_liquidada_fecha'];

  it('los tres campos declaran exactamente los roles que liquidan', () => {
    const quienLiquida = [...liquidarPropinas.roles].sort();
    expect(quienLiquida.length).toBeGreaterThan(0);

    for (const campo of CAMPOS) {
      // `rolesDelCampo` devuelve `[]` cuando no hay política declarada, así que
      // borrar la línea entera —que es como se abre un campo sin querer— cae
      // aquí igual que estrecharla.
      expect([...rolesDelCampo('Venta', campo)].sort(), `Venta.${campo}`).toEqual(quienLiquida);
    }
  });

  it('las dos pantallas que lo pintan siguen siendo de la dirección', () => {
    const permisos = readFileSync(join(HEREDADO, 'lib', 'permissions.js'), 'utf8');
    // Sobre la ENTRADA, no sobre el archivo: añadir `ROLES.CASHIER` a
    // cualquiera de las dos deja de casar, y entonces la premisa de arriba ya
    // no es cierta y hay que volver a decidir `rolesLectura` a conciencia.
    // La coma opcional es para no castigar un reformateo: `trailingComma: all`
    // pone una si la lista se parte en varias líneas, y eso no es un cambio de
    // permisos. Lo que no se tolera es un segundo rol.
    expect(permisos).toMatch(/ver_dashboard:\s*\[\s*ROLES\.ADMIN\s*,?\s*\]/);
    expect(permisos).toMatch(/ver_registros:\s*\[\s*ROLES\.ADMIN\s*,?\s*\]/);

    // Y que `ROLES.ADMIN` siga siendo exactamente esos tres: la traducción es
    // el eslabón que convierte «administrador» de su menú en tres roles de esta
    // base, y sin ella la cita de `permissions.js` no probaría nada.
    for (const rol of liquidarPropinas.roles) expect(rolMH(rol), rol).toBe('administrador');
    expect(rolMH('cajero')).toBe('caja');
  });

  it('ninguna otra pantalla lee ni monta el panel de propinas', () => {
    // El contraste que hace honesta a la prueba anterior: si mañana alguien
    // mete la pestaña de propinas en Caja —que el cajero SÍ abre—, la premisa
    // cambia y esto se pone en rojo antes de que el panel mienta.
    expect(heredadosQueContienen('propina_liquidada')).toEqual([
      'components/propinas/LiquidarPropinasDialog.jsx',
      'components/propinas/PropinasDashboardSection.jsx',
      'components/propinas/PropinasRegistros.jsx',
    ]);
    expect(heredadosQueContienen('propinas/PropinasDashboardSection')).toEqual([
      'pages/Dashboard.jsx',
    ]);
    expect(heredadosQueContienen('propinas/PropinasRegistros')).toEqual(['pages/Registros.jsx']);
  });
});
