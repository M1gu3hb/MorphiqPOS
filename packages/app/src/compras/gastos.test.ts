import { PAQUETES_OPERATIVOS, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { registrarCompra } from './compras.ts';
import {
  entradaGuardarPlantillaGasto,
  entradaRegistrarGasto,
  entradaUsarPlantillaCompra,
} from './esquemas.ts';
import { guardarPlantillaGasto, registrarGasto } from './gastos.ts';
import { reconocerNotasHeredadas } from './notas.ts';

/**
 * E4-5 · gastos operativos, sin base de datos.
 *
 * La mitad transaccional —el `movimientos_caja` de tipo `gasto` que sale del
 * cajón, y el `CAJA_CERRADA` cuando no hay sesión abierta— necesita Postgres y
 * se prueba interrumpiendo los pasos `cargar_caja` y `registrar_salida_de_caja`.
 * Aquí queda lo que sí es puro: los prefijos heredados y la forma de la entrada.
 */

const UUID = '00000000-0000-4000-8000-000000000002';

describe('gastos · declaración de los comandos', () => {
  it('nombra, autoriza y escribe igual que sus gemelos de compras', () => {
    expect(registrarGasto.nombre).toBe('gastos.registrar');
    expect(guardarPlantillaGasto.nombre).toBe('gastos.guardar_plantilla');

    /**
     * Esta prueba afirmaba `['cafeteria', 'restaurante']`, escrito a mano, y lo
     * que quería decir era «gastos no existe en Esencial». Dejó de ser cierto
     * con D-01, que aplica la migración 058: los tres valores de
     * `organizaciones.paquete` ya no son niveles comerciales sino modelos de
     * negocio —`tienda`, `cafeteria`, `restaurante`— y el nivel `esencial`, el
     * que vendía sin controlar stock, desapareció. `PAQUETES_OPERATIVOS` pasó a
     * ser los TRES porque `MODULOS_POR_PLANTILLA` le da a `tienda` el bloque de
     * operación entero; dejarlo en dos habría dejado el módulo `gastos`
     * encendido en el menú y el POST de `gastos.registrar` devolviendo 403.
     *
     * Lo que se afirma ahora es más fuerte que lo que se afirmaba antes:
     *
     * · La IDENTIDAD con la constante compartida, no la igualdad de contenido.
     *   Es el contrato de `verify:paquetes` —ningún comando escribe la lista a
     *   mano— comprobado desde dentro: una copia con los mismos tres elementos
     *   pasa un `toEqual` y se queda congelada en el próximo renombre, que es
     *   justo lo que le pasó a la línea que esto sustituye.
     * · Que gastos declara EL MISMO conjunto que compras, que es lo que esta
     *   prueba promete en su nombre y antes no comprobaba: se medía contra un
     *   literal, no contra sus gemelos.
     * · Que `tienda` está DENTRO. Es la mitad de D-01 que se puede perder sin
     *   que nada más avise: una tienda que no puede registrar la renta ni la luz
     *   no sabe su utilidad, y ésa era la razón de la decisión. Lo que decide si
     *   un negocio concreto ve gastos es la perilla (F-016), no la plantilla.
     */
    for (const comando of [registrarGasto, guardarPlantillaGasto]) {
      expect(comando.escribe).toBe(true);
      expect(comando.paquetes).toBe(PAQUETES_OPERATIVOS);
      expect(comando.paquetes).toBe(registrarCompra.paquetes);
      expect(comando.paquetes).toContain('tienda');
      expect(comando.roles).toEqual(['dueno', 'administrador', 'gerente']);
    }

    // Que este conjunto se haya ensanchado no deja al gate sin filo: sala sigue
    // siendo exclusiva de `restaurante`. Si alguien «arregla» un 403 abriendo
    // los subconjuntos en vez de encender la perilla, rompe estas dos líneas.
    expect(PAQUETES_RESTAURANTE).not.toContain('tienda');
    expect(PAQUETES_RESTAURANTE).not.toContain('cafeteria');
  });
});

describe('§25.1 · los dos datos que hoy viajan dentro de las notas', () => {
  it('reconoce el prefijo de recurrente y lo saca del texto', () => {
    const leido = reconocerNotasHeredadas('[RECURRENTE/FIJO MENSUAL] Recibo de mayo');
    expect(leido.esRecurrente).toBe(true);
    expect(leido.notas).toBe('Recibo de mayo');
  });

  it('reconoce el vínculo con la plantilla y devuelve su nombre', () => {
    const leido = reconocerNotasHeredadas('[Desde plantilla: Renta local] pagada en efectivo');
    expect(leido.nombrePlantilla).toBe('Renta local');
    expect(leido.notas).toBe('pagada en efectivo');
  });

  it('reconoce los dos prefijos en cualquier orden', () => {
    const uno = reconocerNotasHeredadas('[RECURRENTE/FIJO MENSUAL] [Desde plantilla: Luz] ');
    const otro = reconocerNotasHeredadas('[Desde plantilla: Luz] [RECURRENTE/FIJO MENSUAL]');
    for (const leido of [uno, otro]) {
      expect(leido.esRecurrente).toBe(true);
      expect(leido.nombrePlantilla).toBe('Luz');
      expect(leido.notas).toBeNull();
    }
  });

  it('deja intacta una nota que no trae prefijos', () => {
    expect(reconocerNotasHeredadas('Se pagó al proveedor de siempre')).toEqual({
      notas: 'Se pagó al proveedor de siempre',
      esRecurrente: false,
      nombrePlantilla: null,
    });
  });

  it('no confunde un corchete cualquiera con un prefijo', () => {
    const leido = reconocerNotasHeredadas('[nota interna] revisar con el contador');
    expect(leido.esRecurrente).toBe(false);
    expect(leido.nombrePlantilla).toBeNull();
    expect(leido.notas).toBe('[nota interna] revisar con el contador');
  });
});

describe('gastos · lo que la entrada admite', () => {
  const base = {
    categoria: 'servicios',
    descripcion: 'Recibo CFE de mayo',
    monto: '1250.50',
    metodoPago: 'efectivo',
  };

  it('acepta el gasto con sus columnas de verdad, no con prefijos de texto', () => {
    const analizada = entradaRegistrarGasto.parse({
      ...base,
      esRecurrente: true,
      plantillaGastoId: UUID,
    });
    expect(analizada.esRecurrente).toBe(true);
    expect(analizada.plantillaGastoId).toBe(UUID);
  });

  it('rechaza monto cero, monto negativo y categoría inventada', () => {
    expect(entradaRegistrarGasto.safeParse({ ...base, monto: '0' }).success).toBe(false);
    expect(entradaRegistrarGasto.safeParse({ ...base, monto: '-10' }).success).toBe(false);
    expect(entradaRegistrarGasto.safeParse({ ...base, categoria: 'nomina' }).success).toBe(false);
  });

  it('exige periodicidad y día de pago dentro del mes en la plantilla', () => {
    const plantilla = {
      nombre: 'Renta del local',
      categoria: 'otro',
      montoSugerido: '18000',
      metodoPago: 'transferencia',
      periodicidad: 'mensual',
    };
    expect(entradaGuardarPlantillaGasto.safeParse(plantilla).success).toBe(true);
    expect(
      entradaGuardarPlantillaGasto.safeParse({ ...plantilla, diaPagoSugerido: 32 }).success,
    ).toBe(false);
    expect(
      entradaGuardarPlantillaGasto.safeParse({ ...plantilla, periodicidad: 'trimestral' }).success,
    ).toBe(false);
  });

  it('la plantilla de compra que se usa no acepta líneas del cliente', () => {
    // Las líneas salen de la plantilla guardada, no del cuerpo: si viajaran
    // aquí, «usar plantilla» sería otra vía para registrar cualquier compra.
    const analizada = entradaUsarPlantillaCompra.parse({
      plantillaId: UUID,
      lineas: [{ insumoId: UUID, costoTotal: '99999' }],
    });
    expect(Object.hasOwn(analizada, 'lineas')).toBe(false);
  });
});
