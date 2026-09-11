import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ErrorDominio, ROLES } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { consultar } from './consultar.ts';
import { entidadMapeada, MAPA } from './mapa.ts';

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
    expect(codigo).toContain(
      "qr_token: { rolesLectura: [...DIRECCION], columna: 'qr_token', conversion: 'texto' }",
    );
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
});
