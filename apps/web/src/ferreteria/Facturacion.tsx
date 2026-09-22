'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · facturacion
 *
 * Los datos fiscales del cliente y las remisiones que están esperando factura.
 *
 * ── Lo que esta pantalla NO hace, y hay que decirlo aquí ────────────────
 * No timbra. El CFDI está bloqueado por la decisión P-02: mete un PAC, un costo
 * mensual y una obligación fiscal que no la decide una pantalla. Lo que sí hace
 * es dejar el hueco LIMPIO: los datos fiscales capturados y las remisiones del
 * mes agrupadas, para que el día que se elija PAC sólo falte el timbrado.
 *
 * ── Por qué los datos fiscales se capturan igual ────────────────────────
 * Porque el contratista los da UNA VEZ, al abrirle crédito, y pedirlos el día
 * que se decida facturar significa perseguir a cuarenta clientes por teléfono.
 * Capturarlos ahora no cuesta nada y ahorra ese mes entero.
 *
 * ── Por qué se AGRUPAN las remisiones del mes ───────────────────────────
 * Un contratista se lleva material quince veces al mes y quiere UNA factura.
 * Facturar remisión por remisión son quince documentos que él no quiere y que
 * su contador tampoco. Ver el grupo ya armado es la mitad del trabajo hecho.
 *
 * ── Por qué el RFC se valida de forma y no contra el SAT ────────────────
 * Validarlo contra el SAT exige el PAC que todavía no existe. La forma —doce o
 * trece caracteres con su homoclave— atrapa el 90 % de los errores de captura,
 * que es lo que se puede hacer hoy sin inventar una integración.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben los datos fiscales y el grupo del mes. Queda fuera el timbrado, la
 * cancelación y el complemento de pago: los tres son P-02.
 */

const RUTA_CLIENTE = '/api/clientes';

/** Persona moral son 12; persona física, 13. Con homoclave. */
const RFC_CON_FORMA = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Los usos que de verdad pide un cliente de ferretería. */
const USOS_CFDI = [
  { clave: 'G01', etiqueta: 'G01 · Adquisición de mercancías' },
  { clave: 'G03', etiqueta: 'G03 · Gastos en general' },
  { clave: 'I01', etiqueta: 'I01 · Construcciones' },
  { clave: 'S01', etiqueta: 'S01 · Sin efectos fiscales' },
] as const;

export interface ClienteFiscal {
  readonly id: string;
  readonly nombre: string;
  readonly rfc: string | null;
  readonly regimen_fiscal: string | null;
  readonly uso_cfdi: string | null;
  readonly codigo_postal: string | null;
}

export interface RemisionPorFacturar {
  readonly id: string;
  readonly folio: string;
  /** `entregada_en`, que es como lo sirve `Remision`: la fecha de la entrega. */
  readonly entregada_en: string | null;
  readonly importe_centavos: number;
}

export interface FacturacionProps {
  readonly clientesIniciales?: readonly ClienteFiscal[];
}

function pesos(centavos: number): string {
  return PESOS.format(centavos / 100);
}

/** La forma del RFC. No dice si existe: dice si se tecleó algo con su forma. */
export function rfcConForma(rfc: string): boolean {
  return RFC_CON_FORMA.test(rfc.trim().toUpperCase());
}

/** Lo que falta para poder facturarle el día que se pueda. */
export function huecosFiscales(cliente: ClienteFiscal): readonly string[] {
  const huecos: string[] = [];
  if (cliente.rfc === null || cliente.rfc === '') huecos.push('RFC');
  if (cliente.regimen_fiscal === null) huecos.push('régimen');
  if (cliente.codigo_postal === null) huecos.push('código postal');
  return huecos;
}

/** El grupo del mes: un contratista se lleva material quince veces y quiere UNA. */
export function totalDelGrupo(remisiones: readonly RemisionPorFacturar[]): number {
  return remisiones.reduce((suma, remision) => suma + remision.importe_centavos, 0);
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar. Lo capturado sigue aquí.';
}

export function Facturacion({ clientesIniciales }: FacturacionProps) {
  const voc = useVocabulario();
  const [clientes, setClientes] = useState<readonly ClienteFiscal[] | null>(
    clientesIniciales ?? null,
  );
  const [elegido, setElegido] = useState<ClienteFiscal | null>(null);
  const [remisiones, setRemisiones] = useState<readonly RemisionPorFacturar[] | null>(null);
  const [datos, setDatos] = useState({ rfc: '', regimen: '', uso: 'G01', codigoPostal: '' });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (clientesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      consultarPuente<ClienteFiscal>('Cliente', { limite: 200, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setClientes(filas);
        })
        .catch(() => {
          if (sigueMontada()) setClientes([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [clientesIniciales]);

  function abrir(cliente: ClienteFiscal): void {
    setElegido(cliente);
    setDatos({
      rfc: cliente.rfc ?? '',
      regimen: cliente.regimen_fiscal ?? '',
      uso: cliente.uso_cfdi ?? 'G01',
      codigoPostal: cliente.codigo_postal ?? '',
    });
    setRemisiones(null);
    setError(null);
    setAviso(null);

    consultarPuente<RemisionPorFacturar>('Remision', {
      filtro: { cliente_id: cliente.id },
      limite: 60,
    })
      .then((filas) => {
        setRemisiones(filas);
      })
      .catch(() => {
        setRemisiones([]);
      });
  }

  function guardar(): void {
    if (elegido === null) return;
    const rfc = datos.rfc.trim().toUpperCase();
    if (rfc !== '' && !rfcConForma(rfc)) {
      setError('Ese RFC no tiene forma de RFC. Revísalo antes de guardarlo.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<ClienteFiscal>(`${RUTA_CLIENTE}/${elegido.id}`, {
      rfc: rfc === '' ? null : rfc,
      regimenFiscal: datos.regimen.trim() === '' ? null : datos.regimen.trim(),
      usoCfdi: datos.uso,
      codigoPostal: datos.codigoPostal.trim() === '' ? null : datos.codigoPostal.trim(),
    })
      .then((actualizado) => {
        setElegido(actualizado);
        setClientes((clientes ?? []).map((c) => (c.id === elegido.id ? actualizado : c)));
        setAviso('Guardado. El día que se pueda facturar, ya no habrá que perseguirlo.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (clientes === null) {
    return (
      <div className="space-y-(--espacio-4) p-(--espacio-6)">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-(--espacio-6) p-(--espacio-6) md:grid-cols-[20rem_1fr]">
      <section className="space-y-(--espacio-3)">
        <h1 className="text-2xl font-semibold">Facturación</h1>
        <p className="text-texto-sutil text-sm">
          Todavía no se timbra. Lo que se hace es dejar el hueco limpio.
        </p>
        <ul className="divide-y">
          {clientes.map((cliente) => {
            const huecos = huecosFiscales(cliente);
            return (
              <li key={cliente.id}>
                <button
                  type="button"
                  className={`w-full py-2 text-left ${elegido?.id === cliente.id ? 'font-medium' : ''}`}
                  onClick={() => {
                    abrir(cliente);
                  }}
                >
                  {cliente.nombre}
                  <span className="text-texto-sutil ml-2 text-xs">
                    {huecos.length === 0 ? 'completo' : `falta ${huecos.join(', ')}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-(--espacio-4)">
        {error !== null && (
          <p role="alert" className="text-peligro text-sm">
            {error}
          </p>
        )}
        {aviso !== null && <p className="text-sm">{aviso}</p>}

        {elegido === null && (
          <p className="text-texto-sutil">
            Elige {voc.enFraseCon('un', 'cliente')} para capturar sus datos.
          </p>
        )}

        {elegido !== null && (
          <>
            <h2 className="text-xl font-medium">{elegido.nombre}</h2>

            <div className="grid gap-(--espacio-3) md:grid-cols-2">
              <div>
                <Label htmlFor="rfc">RFC</Label>
                <Input
                  id="rfc"
                  className="h-[calc(var(--altura-control)*1.2)] uppercase"
                  value={datos.rfc}
                  onChange={(evento) => {
                    setDatos({ ...datos, rfc: evento.target.value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="cp">Código postal</Label>
                <Input
                  id="cp"
                  inputMode="numeric"
                  className="h-[calc(var(--altura-control)*1.2)]"
                  value={datos.codigoPostal}
                  onChange={(evento) => {
                    setDatos({ ...datos, codigoPostal: evento.target.value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="regimen">Régimen fiscal</Label>
                <Input
                  id="regimen"
                  className="h-[calc(var(--altura-control)*1.2)]"
                  placeholder="601"
                  value={datos.regimen}
                  onChange={(evento) => {
                    setDatos({ ...datos, regimen: evento.target.value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="uso">Uso del CFDI</Label>
                <select
                  id="uso"
                  className="border-borde-fuerte h-[calc(var(--altura-control)*1.2)] w-full rounded-md border px-(--espacio-3)"
                  value={datos.uso}
                  onChange={(evento) => {
                    setDatos({ ...datos, uso: evento.target.value });
                  }}
                >
                  {USOS_CFDI.map((uso) => (
                    <option key={uso.clave} value={uso.clave}>
                      {uso.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              className="h-[calc(var(--altura-control)*1.4)]"
              disabled={ocupado}
              onClick={guardar}
            >
              Guardar datos fiscales
            </Button>

            <Separator />

            <div>
              <h3 className="font-medium">Remisiones del periodo</h3>
              <p className="text-texto-sutil text-sm">
                Un contratista se lleva {voc.singular('producto')} quince veces al mes y quiere una
                sola factura.
              </p>
            </div>
            {remisiones === null && <Skeleton className="h-24 w-full" />}
            {remisiones !== null && remisiones.length === 0 && (
              <p className="text-texto-sutil text-sm">No hay remisiones sin facturar.</p>
            )}
            <ul className="divide-y">
              {(remisiones ?? []).map((remision) => (
                <li key={remision.id} className="flex items-baseline justify-between py-2">
                  <span>{remision.folio}</span>
                  <span className="text-texto-sutil text-sm">
                    {(remision.entregada_en ?? '').slice(0, 10)}
                  </span>
                  <span className="tabular-nums">{pesos(remision.importe_centavos)}</span>
                </li>
              ))}
            </ul>
            {remisiones !== null && remisiones.length > 0 && (
              <p className="flex items-baseline justify-between text-lg font-semibold">
                <span>Se facturaría</span>
                <span className="tabular-nums">{pesos(totalDelGrupo(remisiones))}</span>
              </p>
            )}

            <p className="text-texto-sutil text-sm">
              El timbrado está bloqueado hasta que se elija PAC: mete un costo mensual y una
              obligación fiscal que no decide una pantalla. Lo de debajo ya está construido.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
