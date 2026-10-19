'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Checkbox } from '@morphiqpos/ui/primitivas/checkbox';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { RadioGroup, RadioGroupItem } from '@morphiqpos/ui/primitivas/radio-group';
import { Aviso, CampoDeDinero, Dinero, Superficie } from '@morphiqpos/ui/sistema';
import { Banknote, Check, CreditCard, Landmark, Split } from 'lucide-react';

import {
  faltaEnMixto,
  type CuentaDeTransferencia,
  type Metodo,
  type RenglonDePago,
} from './cobro-de-cita';

/**
 * PIEZA · estetica-salon · el pago de un cobro
 *
 * Cómo paga la clienta: un método por lo que queda por cobrar, o MIXTO. El caso típico
 * del giro no es dos tarjetas: es «tenía $300 de anticipo, pago $500 en efectivo y
 * $330 con tarjeta» (`02-DINERO-Y-CAJA §5`). Por eso el mixto son los tres métodos a
 * la vista con su importe, y un renglón que dice lo que falta o lo que sobra —COBRAR
 * no se enciende hasta que cuadra, y el servidor lo vuelve a comprobar—.
 *
 * ── Y la pregunta de la transferencia, que ahora SÍ se guarda ────────────
 * «¿A qué cuenta?» se preguntaba y la respuesta se tiraba. El dinero que cae en la
 * cuenta personal de la profesional pasa igual; la única diferencia es si el negocio
 * lo sabe (descuadre 1). La respuesta viaja con el pago y queda en su referencia.
 */

/** Los tres métodos que acepta `venta.cobrar_cita`, más el mixto. Ni uno más. */
const METODOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo', Icono: Banknote },
  { clave: 'tarjeta', etiqueta: 'Tarjeta', Icono: CreditCard },
  { clave: 'transferencia', etiqueta: 'Transferencia', Icono: Landmark },
] as const;

export interface PersonaDelPago {
  readonly id: string;
  readonly nombre: string;
}

export interface PagoDelCobroProps {
  readonly porCobrar: number;
  readonly modo: 'uno' | 'mixto';
  readonly metodo: Metodo | null;
  readonly renglones: readonly RenglonDePago[];
  readonly cuenta: CuentaDeTransferencia;
  /** Quienes atendieron: la transferencia pudo caer en la cuenta de cualquiera. */
  readonly equipo: readonly PersonaDelPago[];
  readonly alElegirMetodo: (metodo: Metodo) => void;
  readonly alElegirMixto: () => void;
  readonly alCambiarRenglon: (metodo: Metodo, centavos: number | null) => void;
  readonly alCambiarCuenta: (cuenta: CuentaDeTransferencia) => void;
}

export function PagoDelCobro({
  porCobrar,
  modo,
  metodo,
  renglones,
  cuenta,
  equipo,
  alElegirMetodo,
  alElegirMixto,
  alCambiarRenglon,
  alCambiarCuenta,
}: PagoDelCobroProps) {
  const falta = faltaEnMixto(porCobrar, renglones);
  const hayTransferencia =
    modo === 'uno'
      ? metodo === 'transferencia'
      : renglones.some((r) => r.metodo === 'transferencia' && (r.centavos ?? 0) > 0);

  return (
    <div className="flex flex-col gap-(--espacio-3)">
      <div className="grid grid-cols-2 gap-(--espacio-2)">
        {METODOS.map(({ clave, etiqueta, Icono }) => {
          const elegido = modo === 'uno' && metodo === clave;
          return (
            <Button
              key={clave}
              type="button"
              variant={elegido ? 'default' : 'outline'}
              aria-pressed={elegido}
              className="min-h-[calc(var(--altura-control)*1.8)] text-base"
              onClick={() => {
                alElegirMetodo(clave);
              }}
            >
              {/* El color nunca es el único que dice cuál está elegido: la marca
                  sustituye al icono del método. */}
              {elegido ? <Check aria-hidden="true" /> : <Icono aria-hidden="true" />}
              {etiqueta}
            </Button>
          );
        })}
        <Button
          type="button"
          variant={modo === 'mixto' ? 'default' : 'outline'}
          aria-pressed={modo === 'mixto'}
          className="min-h-[calc(var(--altura-control)*1.8)] text-base"
          onClick={alElegirMixto}
        >
          {modo === 'mixto' ? <Check aria-hidden="true" /> : <Split aria-hidden="true" />}
          Mixto
        </Button>
      </div>

      {modo === 'mixto' && (
        <Superficie nivel={0} relleno={3} radio="md" className="flex flex-col gap-(--espacio-2)">
          {METODOS.map(({ clave, etiqueta }) => (
            <span key={clave} className="grid grid-cols-[7rem_1fr] items-center gap-(--espacio-2)">
              <Label htmlFor={`mixto-${clave}`}>{etiqueta}</Label>
              <CampoDeDinero
                id={`mixto-${clave}`}
                placeholder="0.00"
                centavos={renglones.find((r) => r.metodo === clave)?.centavos ?? null}
                alCambiar={(centavos) => {
                  alCambiarRenglon(clave, centavos);
                }}
              />
            </span>
          ))}
          {falta === 0 ? (
            <p className="text-sm text-exito">Cuadra con lo que queda por cobrar.</p>
          ) : (
            <Aviso
              tono="atencion"
              titulo={
                <>
                  {falta > 0 ? 'Faltan ' : 'Sobran '}
                  <Dinero centavos={Math.abs(falta)} tamano="sm" />
                </>
              }
            >
              COBRAR se enciende cuando los tres suman lo que queda por cobrar.
            </Aviso>
          )}
        </Superficie>
      )}

      {hayTransferencia && (
        <Superficie nivel={0} relleno={3} radio="md" className="bg-fondo-sutil">
          <RadioGroup
            value={cuenta.profesionalId ?? 'salon'}
            onValueChange={(valor) => {
              alCambiarCuenta({ ...cuenta, profesionalId: valor === 'salon' ? null : valor });
            }}
            aria-label="¿A qué cuenta?"
            className="gap-(--espacio-2)"
          >
            <p className="text-sm font-medium">¿A qué cuenta?</p>
            <span className="flex items-center gap-(--espacio-2)">
              <RadioGroupItem value="salon" id="cuenta-salon" />
              <Label htmlFor="cuenta-salon">Cuenta del salón</Label>
            </span>
            {equipo.map((persona) => (
              <span key={persona.id} className="flex items-center gap-(--espacio-2)">
                <RadioGroupItem value={persona.id} id={`cuenta-${persona.id}`} />
                <Label htmlFor={`cuenta-${persona.id}`}>
                  Cuenta de {persona.nombre} · se le descuenta de su liquidación
                </Label>
              </span>
            ))}
          </RadioGroup>
          <span className="mt-(--espacio-3) flex items-center gap-(--espacio-2)">
            <Checkbox
              id="transferencia-por-confirmar"
              checked={cuenta.porConfirmar}
              onCheckedChange={(marcado) => {
                alCambiarCuenta({ ...cuenta, porConfirmar: marcado === true });
              }}
            />
            <Label htmlFor="transferencia-por-confirmar">Pendiente de confirmar en el banco</Label>
          </span>
        </Superficie>
      )}
    </div>
  );
}
