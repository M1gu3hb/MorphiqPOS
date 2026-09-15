import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * El tronco compartido de la Fase 2: kardex, traspaso, toma física, valuación,
 * merma y el ledger de pasivos de terceros.
 *
 * ── Qué vigila este archivo, y qué NO ──────────────────────────────────────
 * Vigila las decisiones que serían CARAS de deshacer y que no tienen otra
 * puerta: que el kardex sea una vista y no una tabla, que el ledger de pasivos
 * no admita `update`, y que las cuatro naturalezas de dinero ajeno vivan en UNA
 * tabla y no en cuatro.
 *
 * No vigila que el SQL corra: eso lo hará el acople. Es un cerco, no una
 * demostración — y las reglas de «estado ⇒ columna» de estas tablas las cubre
 * `estados-con-columna.contrato.test.ts`, que las deriva del `check` solo.
 */

function sql(archivo: string): string {
  return readFileSync(fileURLToPath(new URL(`./sql/${archivo}`, import.meta.url)), 'utf8');
}

const KARDEX = sql('060_kardex.sql');
const MOVIMIENTOS = sql('061_traspasos_y_toma_fisica.sql');
const VALUACION = sql('062_valuacion_y_merma.sql');
const PASIVOS = sql('063_pasivos_de_terceros.sql');
const SEMILLA = sql('066_plantillas_semilla.sql');

describe('060 · F-103 · el kardex es una VISTA sobre el ledger', () => {
  it('no crea una tabla: el dato ya existe en movimientos_stock', () => {
    // Guardarlo en tabla obligaría a mantener dos fuentes del mismo número y
    // abriría la puerta a que discrepen — el defecto que un ledger inmutable
    // existe para no tener.
    expect(KARDEX).toContain('create view kardex as');
    expect(KARDEX).not.toMatch(/create table\s+kardex/i);
  });

  it('el saldo corrido se particiona POR ALMACÉN', () => {
    // El mismo insumo en dos almacenes son dos saldos. Sumarlos daría un número
    // que no existe en ningún estante.
    expect(KARDEX).toMatch(/partition by m\.organizacion_id,\s*m\.almacen_id,\s*m\.insumo_id/);
  });

  it('la vista hereda la RLS de su tabla base', () => {
    // Sin `security_invoker`, la vista corre con los permisos de quien la creó
    // y es una puerta trasera al ledger de TODAS las organizaciones.
    expect(KARDEX).toContain('set (security_invoker = on)');
  });

  it('lleva el índice que hace que abrir una ficha no recorra el ledger', () => {
    expect(KARDEX).toMatch(
      /create index[\s\S]{0,60}movimientos_stock \(organizacion_id, insumo_id/,
    );
  });
});

describe('061 · F-105 y F-106 · lo que se mueve sin ser una venta', () => {
  it('el traspaso no puede ir de un almacén a sí mismo', () => {
    expect(MOVIMIENTOS).toContain('check (almacen_origen <> almacen_destino)');
  });

  it('la línea guarda lo RECIBIDO aparte de lo enviado', () => {
    // La diferencia es el dato que importa: sin ella el traspaso cuadra siempre
    // en el papel y nunca en el estante.
    expect(MOVIMIENTOS).toMatch(/cantidad_recibida numeric/);
  });

  it('el conteo congela el esperado en vez de compararlo después', () => {
    // Entre el conteo y el cierre pudo haber ventas: comparar contra el saldo
    // actual daría una diferencia falsa.
    expect(MOVIMIENTOS).toMatch(/esperado\s+numeric\(14, 4\) not null/);
  });

  it('el conteo cíclico por zona es opcional, no obligatorio', () => {
    // F-149: `null` = toma completa. Obligar a zona haría imposible la toma
    // anual, y dejarla fuera haría imposible la rutina de veinte minutos.
    expect(MOVIMIENTOS).toMatch(/zona\s+text,/);
  });
});

describe('062 · F-108 y F-109 · valuación y merma', () => {
  it('el valor del inventario va en centavos enteros', () => {
    // Es dinero, y el dinero de este sistema vive en bigint de centavos sin
    // excepción. Un `numeric` aquí abriría la puerta a los flotantes.
    expect(VALUACION).toMatch(/valor_centavos\s+bigint\s+not null/);
  });

  it('los motivos de merma son tabla, no un check', () => {
    // Cada giro añade los suyos: un `check` obligaría a una migración por
    // motivo, y entonces nadie añadiría ninguno.
    expect(VALUACION).toContain('create table motivos_merma');
    expect(VALUACION).not.toMatch(/check \(motivo in \(/);
  });

  it('un motivo distingue si es imputable a alguien', () => {
    // Es lo que separa una merma que se acepta de una que hay que investigar, y
    // lo único que hace que el número sirva para detectar robo.
    expect(VALUACION).toMatch(/imputable\s+boolean\s+not null/);
  });

  it('la llave al catálogo de motivos es NOT VALID sobre lo histórico', () => {
    // Lo viejo lleva motivos escritos a mano. Validarlos hacia atrás obligaría
    // a reescribirlos, que es inventar datos.
    expect(VALUACION).toMatch(
      /foreign key \(motivo\) references motivos_merma \(clave\)\s*\n?\s*not valid/,
    );
  });
});

describe('063 · UN ledger para las cuatro formas de dinero ajeno', () => {
  it('las cuatro naturalezas viven en UNA tabla', () => {
    // F-254 fiado, F-255 servicios de terceros, F-256 envase y F-260 propina por
    // entregar son cuatro pantallas sobre el mismo objeto. Escritas cuatro
    // veces se descuadran de cuatro formas distintas.
    const naturalezas = /naturaleza in \(([\s\S]*?)\)/.exec(PASIVOS)?.[1] ?? '';
    for (const clave of [
      'credito_cliente',
      'servicio_terceros',
      'envase_retornable',
      'propina_por_entregar',
      'anticipo_cliente',
    ]) {
      expect(naturalezas, `falta la naturaleza ${clave}`).toContain(`'${clave}'`);
    }
  });

  it('el monto va FIRMADO: el saldo es la suma', () => {
    expect(PASIVOS).toMatch(/monto_centavos\s+bigint\s+not null/);
    // Un movimiento en cero no dice nada y ensucia el ledger.
    expect(PASIVOS).toContain('check (monto_centavos <> 0)');
  });

  it('el ledger es INMUTABLE: se concede insert, jamás update ni delete', () => {
    // Un saldo que cambia solo después de que alguien lo vio destruye la
    // confianza en el sistema entero, aunque el número final sea correcto. Una
    // corrección es una contrapartida con motivo y autor.
    const concesion = /grant ([a-z, ]+) on table pasivos_terceros/.exec(PASIVOS)?.[1] ?? '';
    expect(concesion).toContain('select');
    expect(concesion).toContain('insert');
    expect(concesion).not.toContain('update');
    expect(concesion).not.toContain('delete');
  });

  it('cada movimiento puede atarse al movimiento de caja gemelo', () => {
    // El dinero entró al cajón. Sin la atadura, el arqueo no puede explicar de
    // dónde salió: es el descuadre número uno de abarrotes y de estética.
    expect(PASIVOS).toMatch(/movimiento_caja_id uuid\s+references movimientos_caja \(id\)/);
  });

  it('el portador de un envase no lleva titular, y los demás sí', () => {
    // Un casco se le debe a quien traiga el envase, y no se sabe quién es. Una
    // propina de tarjeta se le debe a UNA persona, o no se le puede pagar.
    expect(PASIVOS).toMatch(/titular_tipo = 'portador' and titular_id is null/);
    expect(PASIVOS).toMatch(/titular_tipo <> 'portador' and titular_id is not null/);
  });

  it('el saldo es una vista derivada, no una columna que se actualiza', () => {
    expect(PASIVOS).toContain('create view saldos_pasivos as');
    expect(PASIVOS).toContain('set (security_invoker = on)');
    // Un saldo en cero no es una deuda y no debe aparecer.
    expect(PASIVOS).toMatch(/having sum\(p\.monto_centavos\) <> 0/);
  });
});

describe('066 · la semilla consolidada de las cinco plantillas', () => {
  it('siembra motivos de merma de los cinco giros que esta fase construye', () => {
    for (const giro of ['cafeteria', 'restaurante', 'tienda', 'ferreteria']) {
      expect(SEMILLA, `falta la semilla de ${giro}`).toContain(`'${giro}'`);
    }
  });

  it('siembra los motivos que las carpetas nombran por su ID', () => {
    // `calibracion` y `bebida_rehecha` son F-156; `caducado_sin_lote` es F-146;
    // `retazo_invendible` es F-150. Si se pierden, esas funciones se construyen
    // contra un motivo que no existe.
    for (const clave of [
      'calibracion',
      'bebida_rehecha',
      'caducado_sin_lote',
      'retazo_invendible',
    ]) {
      expect(SEMILLA).toContain(`'${clave}'`);
    }
  });

  it('no puede sembrar un motivo para un giro que no existe', () => {
    // Sería una semilla muerta: nadie la usaría y nadie se enteraría.
    expect(SEMILLA).toContain('raise exception');
    expect(SEMILLA).toMatch(/huerfanos > 0/);
  });

  it('es idempotente: aplicarla dos veces no duplica', () => {
    const inserts = [...SEMILLA.matchAll(/insert into motivos_merma/g)].length;
    const guardas = [...SEMILLA.matchAll(/on conflict \(clave\) do nothing/g)].length;
    expect(guardas).toBe(inserts);
  });
});
