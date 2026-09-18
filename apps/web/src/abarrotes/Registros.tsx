'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { consultarPuente } from '~/cliente/api';

/**
 * PANTALLA · abarrotes · registros
 *
 * Qué pasó: ventas, movimientos de caja y entradas, en una sola línea de tiempo.
 *
 * ── Por qué es UNA lista y no tres pantallas ────────────────────────────
 * Porque la pregunta que trae aquí a alguien nunca es «enséñame las ventas»:
 * es «qué pasó a las siete y media», o «de dónde salió ese dinero». Tres
 * pantallas obligan a buscar en las tres y a cruzar horas a ojo, que es
 * exactamente lo que nadie hace — y por eso hoy nadie revisa nada.
 *
 * ── Por qué lo que NO tiene motivo se marca ─────────────────────────────
 * Un retiro sin explicación es la única salida de dinero que puede esconder un
 * faltante. Marcarlo en la lista lo convierte en una pregunta que alguien puede
 * hacer esa misma noche, en vez de una diferencia que aparece en el corte y que
 * ya no se puede reconstruir.
 *
 * ── Por qué la cancelación se enseña con quién la hizo ──────────────────
 * Cancelar una venta cobrada es la operación más sensible del mostrador. Sin el
 * nombre al lado, el registro existe y no sirve: nadie va a abrir la ficha de
 * cada una.
 *
 * ── Por qué el filtro es por DÍA y no por rango ─────────────────────────
 * La pregunta es de un día concreto. Un rango obliga a elegir dos fechas para
 * contestar una pregunta de una, y a las diez de la noche eso es una pantalla
 * que se cierra sin usar.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben la línea de tiempo del día, el filtro por tipo y el detalle de cada
 * renglón. Queda fuera la exportación, que es del reporte y no del registro.
 */

const TIPOS = [
  { clave: 'todo', etiqueta: 'Todo' },
  { clave: 'venta', etiqueta: 'Ventas' },
  { clave: 'caja', etiqueta: 'Caja' },
  { clave: 'inventario', etiqueta: 'Inventario' },
] as const;

type Tipo = (typeof TIPOS)[number]['clave'];

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export interface VentaRegistrada {
  readonly id: string;
  readonly fecha: string;
  readonly total_centavos: number;
  readonly estado: string;
  readonly empleado: string | null;
}

export interface MovimientoRegistrado {
  readonly id: string;
  readonly fecha: string;
  readonly tipo: string;
  readonly monto_centavos: number;
  readonly motivo: string | null;
  readonly empleado: string | null;
}

export interface MovimientoDeInventario {
  readonly id: string;
  readonly fecha: string;
  readonly tipo: string;
  readonly insumo: string | null;
  readonly cantidad: string;
  readonly motivo: string | null;
}

export interface RenglonDeRegistro {
  readonly id: string;
  readonly hora: string;
  readonly tipo: Tipo;
  readonly titulo: string;
  readonly detalle: string;
  readonly importe: string | null;
  /** Lo que hay que preguntar esta misma noche. */
  readonly sinExplicacion: boolean;
}

export interface RegistrosProps {
  readonly dia?: string;
  readonly ventasIniciales?: readonly VentaRegistrada[];
  readonly movimientosIniciales?: readonly MovimientoRegistrado[];
  readonly inventarioInicial?: readonly MovimientoDeInventario[];
}

function pesos(centavos: number): string {
  return PESOS.format(centavos / 100);
}

function hora(fecha: string): string {
  return fecha.slice(11, 16);
}

/** Lo que sale del cajón sin explicación. Entrar no necesita motivo; salir sí. */
export function saleSinExplicacion(movimiento: MovimientoRegistrado): boolean {
  const vacio = movimiento.motivo === null || movimiento.motivo.trim() === '';
  return vacio && movimiento.monto_centavos < 0;
}

/**
 * Las tres fuentes en UNA línea de tiempo, de lo más reciente a lo más viejo.
 *
 * Se mezcla aquí y no en tres listas porque la pregunta que trae a alguien
 * nunca es «enséñame las ventas»: es «qué pasó a las siete y media».
 */
export function componerLinea(
  ventas: readonly VentaRegistrada[],
  movimientos: readonly MovimientoRegistrado[],
  inventario: readonly MovimientoDeInventario[],
): readonly RenglonDeRegistro[] {
  const renglones: RenglonDeRegistro[] = [];

  for (const venta of ventas) {
    const cancelada = venta.estado === 'cancelada';
    renglones.push({
      id: `v-${venta.id}`,
      hora: hora(venta.fecha),
      tipo: 'venta',
      titulo: cancelada ? 'Venta cancelada' : 'Venta',
      // Quién la hizo va EN la línea: cancelar una venta cobrada es la
      // operación más sensible del mostrador, y nadie abre la ficha de cada una.
      detalle: venta.empleado ?? 'sin firma',
      importe: pesos(venta.total_centavos),
      sinExplicacion: cancelada && venta.empleado === null,
    });
  }

  for (const movimiento of movimientos) {
    renglones.push({
      id: `c-${movimiento.id}`,
      hora: hora(movimiento.fecha),
      tipo: 'caja',
      titulo: movimiento.tipo.replace(/_/g, ' '),
      detalle: movimiento.motivo ?? movimiento.empleado ?? 'sin motivo',
      importe: pesos(movimiento.monto_centavos),
      sinExplicacion: saleSinExplicacion(movimiento),
    });
  }

  for (const fila of inventario) {
    renglones.push({
      id: `i-${fila.id}`,
      hora: hora(fila.fecha),
      tipo: 'inventario',
      titulo: fila.tipo.replace(/_/g, ' '),
      detalle: `${fila.insumo ?? 'insumo'} · ${fila.cantidad}`,
      importe: null,
      sinExplicacion: false,
    });
  }

  return renglones.sort((a, b) => b.hora.localeCompare(a.hora));
}

export function Registros({
  dia,
  ventasIniciales,
  movimientosIniciales,
  inventarioInicial,
}: RegistrosProps) {
  const [fecha, setFecha] = useState(dia ?? '');
  const [tipo, setTipo] = useState<Tipo>('todo');
  const [ventas, setVentas] = useState<readonly VentaRegistrada[] | null>(ventasIniciales ?? null);
  const [movimientos, setMovimientos] = useState<readonly MovimientoRegistrado[] | null>(
    movimientosIniciales ?? null,
  );
  const [inventario, setInventario] = useState<readonly MovimientoDeInventario[] | null>(
    inventarioInicial ?? null,
  );

  useEffect(() => {
    if (dia !== undefined || fecha !== '') return;
    // El día de hoy se lee en un efecto: un reloj leído durante el render es un
    // desajuste de hidratación garantizado. Y en un `setTimeout`: escribir
    // estado de forma síncrona aquí encadena renders.
    const arranque = setTimeout(() => {
      setFecha(new Date().toISOString().slice(0, 10));
    });
    return () => {
      clearTimeout(arranque);
    };
  }, [dia, fecha]);

  useEffect(() => {
    if (fecha === '') return;
    if (
      ventasIniciales !== undefined &&
      movimientosIniciales !== undefined &&
      inventarioInicial !== undefined
    ) {
      return;
    }
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const filtro = { fecha };

    const cargar = (): void => {
      consultarPuente<VentaRegistrada>('Venta', { filtro, limite: 200, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setVentas(filas);
        })
        .catch(() => {
          if (sigueMontada()) setVentas([]);
        });
      consultarPuente<MovimientoRegistrado>('MovimientoCuenta', {
        filtro,
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setMovimientos(filas);
        })
        .catch(() => {
          if (sigueMontada()) setMovimientos([]);
        });
      consultarPuente<MovimientoDeInventario>('MovimientoInventario', {
        filtro,
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setInventario(filas);
        })
        .catch(() => {
          if (sigueMontada()) setInventario([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [fecha, ventasIniciales, movimientosIniciales, inventarioInicial]);

  const cargando = ventas === null || movimientos === null || inventario === null;
  const linea = cargando ? [] : componerLinea(ventas, movimientos, inventario);
  const visibles = tipo === 'todo' ? linea : linea.filter((r) => r.tipo === tipo);
  const porPreguntar = linea.filter((r) => r.sinExplicacion).length;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Registros</h1>
        <p className="text-muted-foreground text-sm">Qué pasó, en orden y en una sola lista.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="dia">Día</Label>
          <Input
            id="dia"
            type="date"
            className="h-[calc(var(--altura-control)*1.2)] w-48"
            value={fecha}
            onChange={(evento) => {
              setFecha(evento.target.value);
            }}
          />
        </div>
        <div className="flex gap-2">
          {TIPOS.map((opcion) => (
            <Button
              key={opcion.clave}
              type="button"
              variant={tipo === opcion.clave ? 'default' : 'outline'}
              onClick={() => {
                setTipo(opcion.clave);
              }}
            >
              {opcion.etiqueta}
            </Button>
          ))}
        </div>
      </div>

      {porPreguntar > 0 && (
        <p className="text-sm">
          Hay {porPreguntar} movimiento{porPreguntar === 1 ? '' : 's'} sin explicación. Es lo que
          hay que preguntar hoy, no mañana.
        </p>
      )}

      {cargando && <Skeleton className="h-64 w-full" />}

      {!cargando && visibles.length === 0 && (
        <p className="text-muted-foreground">Ese día no tiene movimientos.</p>
      )}

      <ul className="divide-y">
        {visibles.map((renglon) => (
          <li key={renglon.id} className="flex items-baseline gap-4 py-2">
            <span className="w-14 tabular-nums">{renglon.hora}</span>
            <span className="flex-1">
              <span className="font-medium capitalize">{renglon.titulo}</span>
              <span className="text-muted-foreground ml-2 text-sm">{renglon.detalle}</span>
              {renglon.sinExplicacion && (
                <span className="text-destructive ml-2 text-sm">sin explicación</span>
              )}
            </span>
            {renglon.importe !== null && <span className="tabular-nums">{renglon.importe}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
