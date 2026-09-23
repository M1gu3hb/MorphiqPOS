'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, CircleAlert, FileText, Receipt } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

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
 * ── Cómo se ve (`04-INTERFAZ` §PANTALLA 12) ─────────────────────────────
 * La usa el cajero o el dueño en la PC de la caja, varias veces al día. A la
 * izquierda, la lista de clientes con lo que le falta a cada uno —es lo que hay
 * que perseguir—; a la derecha, el panel del que se eligió: sus datos fiscales
 * arriba y su grupo de remisiones debajo, con el total que se facturaría al pie
 * de SU columna. Tocar una fila la convierte en el panel (`VIAJE.fila`). En
 * tableta y teléfono es la misma lista, más corta, con el panel debajo.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben los datos fiscales y el grupo del mes. Queda fuera el timbrado, la
 * cancelación y el complemento de pago: los tres son P-02.
 */

const RUTA_CLIENTE = '/api/clientes';

/** Persona moral son 12; persona física, 13. Con homoclave. */
const RFC_CON_FORMA = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

/** La fecha de entrega como la dice el mostrador: «12 sep 2026». */
const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Los usos que de verdad pide un cliente de ferretería. */
const USOS_CFDI = [
  { clave: 'G01', etiqueta: 'G01 · Adquisición de mercancías' },
  { clave: 'G03', etiqueta: 'G03 · Gastos en general' },
  { clave: 'I01', etiqueta: 'I01 · Construcciones' },
  { clave: 'S01', etiqueta: 'S01 · Sin efectos fiscales' },
] as const;

/** Los campos llevan la misma altura: en la tableta de la caja se tocan con el dedo. */
const ALTO_DE_CAMPO = 'h-[calc(var(--altura-control)*1.2)]';

/** La lista angosta a la izquierda, el panel a la derecha. Por debajo de `lg`, uno sobre otro. */
const REJILLA = 'grid gap-(--espacio-4) lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]';

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

interface DatosCapturados {
  readonly rfc: string;
  readonly regimen: string;
  readonly uso: string;
  readonly codigoPostal: string;
}

const DATOS_EN_BLANCO: DatosCapturados = { rfc: '', regimen: '', uso: 'G01', codigoPostal: '' };

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

function datosDe(cliente: ClienteFiscal): DatosCapturados {
  return {
    rfc: cliente.rfc ?? '',
    regimen: cliente.regimen_fiscal ?? '',
    uso: cliente.uso_cfdi ?? 'G01',
    codigoPostal: cliente.codigo_postal ?? '',
  };
}

/**
 * El día de la entrega, sin moverlo de zona horaria: se toma la fecha tal como
 * viene (`AAAA-MM-DD`) y sólo se le cambia la forma.
 */
function fechaDeEntrega(entregadaEn: string | null): string {
  const dia = (entregadaEn ?? '').slice(0, 10);
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (partes === null) return dia === '' ? '—' : dia;
  const [, anio, mes, fecha] = partes;
  return FECHA_CORTA.format(new Date(Number(anio), Number(mes) - 1, Number(fecha)));
}

/**
 * Completo, o lo que le falta. El color nunca va solo: el icono lo acompaña y la
 * palabra lo dice. El texto no se tiñe —en la fila elegida cambia el fondo—.
 */
function EstadoFiscal({ cliente }: { readonly cliente: ClienteFiscal }) {
  const huecos = huecosFiscales(cliente);
  if (huecos.length === 0) {
    return (
      <span className="inline-flex items-center gap-(--espacio-1)">
        <Check aria-hidden="true" className="size-4 shrink-0 text-exito" />
        completo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-(--espacio-1) font-medium">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-advertencia" />
      falta {huecos.join(', ')}
    </span>
  );
}

function columnasDeClientes(tituloCliente: string): readonly ColumnaDeTabla<ClienteFiscal>[] {
  return [
    {
      clave: 'cliente',
      titulo: tituloCliente,
      orden: (c) => c.nombre,
      celda: (c) => (
        <span className="flex flex-col">
          <span className="font-medium">{c.nombre}</span>
          <span className="font-numeros text-xs tracking-wide text-texto-sutil">
            {c.rfc === null || c.rfc === '' ? 'sin RFC' : c.rfc}
          </span>
        </span>
      ),
    },
    {
      clave: 'datos',
      titulo: 'Datos fiscales',
      // Por lo que falta: lo incompleto es lo que hay que perseguir.
      orden: (c) => huecosFiscales(c).length,
      celda: (c) => <EstadoFiscal cliente={c} />,
    },
  ];
}

const COLUMNAS_DE_REMISIONES: readonly ColumnaDeTabla<RemisionPorFacturar>[] = [
  {
    clave: 'folio',
    titulo: 'Remisión',
    orden: (r) => r.folio,
    celda: (r) => <span className="font-numeros font-medium">{r.folio}</span>,
  },
  {
    clave: 'entregada',
    titulo: 'Entregada',
    orden: (r) => r.entregada_en ?? '',
    celda: (r) => fechaDeEntrega(r.entregada_en),
  },
  {
    clave: 'importe',
    titulo: 'Importe',
    numerica: true,
    orden: (r) => r.importe_centavos,
    celda: (r) => <Dinero centavos={r.importe_centavos} tamano="sm" />,
  },
];

/** Cuántos están listos y a cuántos hay que perseguir. Sale de la lista, no de otra lectura. */
function ResumenFiscal({ clientes }: { readonly clientes: readonly ClienteFiscal[] }) {
  const completos = clientes.filter((c) => huecosFiscales(c).length === 0).length;
  return (
    <dl className="flex gap-(--espacio-6)">
      <div className="flex flex-col items-end gap-(--espacio-1)">
        <dt className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
          Con datos completos
        </dt>
        <dd>
          <Cifra valor={completos} unidad={`de ${String(clientes.length)}`} tamano="lg" />
        </dd>
      </div>
      <div className="flex flex-col items-end gap-(--espacio-1)">
        <dt className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
          Les falta algo
        </dt>
        <dd>
          <Cifra valor={clientes.length - completos} tamano="lg" />
        </dd>
      </div>
    </dl>
  );
}

/**
 * Los cuatro datos que pide un CFDI. El RFC va más grande y en cifras: es el que
 * se dicta por teléfono letra por letra y el que más se equivoca al capturar.
 */
function CamposFiscales({
  datos,
  errorDeRfc,
  alCambiar,
}: {
  readonly datos: DatosCapturados;
  readonly errorDeRfc: string | null;
  readonly alCambiar: (datos: DatosCapturados) => void;
}) {
  return (
    <div className="grid gap-(--espacio-3) md:grid-cols-2">
      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="rfc">RFC</Label>
        <Input
          id="rfc"
          className={`${ALTO_DE_CAMPO} font-numeros text-lg tracking-wide uppercase`}
          aria-invalid={errorDeRfc !== null}
          aria-describedby={errorDeRfc === null ? undefined : 'rfc-sin-forma'}
          value={datos.rfc}
          onChange={(evento) => {
            alCambiar({ ...datos, rfc: evento.target.value });
          }}
        />
        {errorDeRfc !== null && (
          <p id="rfc-sin-forma" className="text-sm font-medium text-peligro">
            {errorDeRfc}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="cp">Código postal</Label>
        <Input
          id="cp"
          inputMode="numeric"
          className={`${ALTO_DE_CAMPO} font-numeros`}
          value={datos.codigoPostal}
          onChange={(evento) => {
            alCambiar({ ...datos, codigoPostal: evento.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="regimen">Régimen fiscal</Label>
        <Input
          id="regimen"
          className={`${ALTO_DE_CAMPO} font-numeros`}
          placeholder="601"
          value={datos.regimen}
          onChange={(evento) => {
            alCambiar({ ...datos, regimen: evento.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="uso">Uso del CFDI</Label>
        {/* Nativo a propósito: en la tableta abre el selector del sistema. */}
        <select
          id="uso"
          className={`${ALTO_DE_CAMPO} w-full rounded-md border border-borde-fuerte bg-transparent px-(--espacio-3) text-sm shadow-1 outline-none focus-visible:border-anillo focus-visible:ring-[3px] focus-visible:ring-anillo/50`}
          value={datos.uso}
          onChange={(evento) => {
            alCambiar({ ...datos, uso: evento.target.value });
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
  );
}

function Remisiones({
  remisiones,
  fallo,
  nombre,
  alReintentar,
}: {
  readonly remisiones: readonly RemisionPorFacturar[] | null;
  readonly fallo: string | null;
  readonly nombre: string;
  readonly alReintentar: () => void;
}) {
  if (fallo !== null) {
    return (
      <ErrorDePantalla
        titulo="No se pudieron leer sus remisiones"
        queHacer="Sin ellas no se arma el grupo del mes. Revisa la conexión y vuelve a leerlas; los datos fiscales de arriba no se tocan."
        detalle={fallo}
        reintentar={
          <Button type="button" variant="outline" onClick={alReintentar}>
            Volver a leer
          </Button>
        }
      />
    );
  }
  if (remisiones === null) return <EsqueletoDeLista filas={3} />;
  const cuantas = remisiones.length;
  return (
    <Tabla
      etiqueta={`Remisiones de ${nombre}`}
      columnas={COLUMNAS_DE_REMISIONES}
      filas={remisiones}
      claveDe={(r) => r.id}
      alto="max-h-[45dvh]"
      pie={{
        folio: `${String(cuantas)} ${cuantas === 1 ? 'remisión' : 'remisiones'}`,
        entregada: <span className="font-medium">Se facturaría</span>,
        importe: <Dinero centavos={totalDelGrupo(remisiones)} tamano="lg" />,
      }}
      vacio={
        <Vacio
          icono={<Receipt />}
          titulo="No hay remisiones sin facturar."
          explicacion="Cuando le despaches con «Remisión a cuenta» (F11) en el mostrador, aparecen aquí para facturarlas juntas."
          className="py-(--espacio-6)"
        />
      }
    />
  );
}

export function Facturacion({ clientesIniciales }: FacturacionProps) {
  const voc = useVocabulario();
  const [clientes, setClientes] = useState<readonly ClienteFiscal[] | null>(
    clientesIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [elegido, setElegido] = useState<ClienteFiscal | null>(null);
  /** La fila que está a punto de convertirse en panel: lleva el nombre del viaje. */
  const [viajando, setViajando] = useState<string | null>(null);
  const [remisiones, setRemisiones] = useState<readonly RemisionPorFacturar[] | null>(null);
  const [falloDeRemisiones, setFalloDeRemisiones] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosCapturados>(DATOS_EN_BLANCO);
  const [errorDeRfc, setErrorDeRfc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** De quién son las remisiones que se están leyendo: una respuesta tardía de otro no pinta. */
  const remisionesDe = useRef<string | null>(null);

  useEffect(() => {
    if (clientesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      consultarPuente<ClienteFiscal>('Cliente', { limite: 200, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setClientes(filas);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada())
            setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer la lista.');
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [clientesIniciales, intento]);

  function leerRemisiones(clienteId: string): void {
    remisionesDe.current = clienteId;
    setRemisiones(null);
    setFalloDeRemisiones(null);
    consultarPuente<RemisionPorFacturar>('Remision', {
      filtro: { cliente_id: clienteId },
      limite: 60,
    })
      .then((filas) => {
        if (remisionesDe.current === clienteId) setRemisiones(filas);
      })
      .catch((fallo: unknown) => {
        if (remisionesDe.current !== clienteId) return;
        setFalloDeRemisiones(
          fallo instanceof Error ? fallo.message : 'No se pudieron leer las remisiones.',
        );
      });
  }

  function abrir(cliente: ClienteFiscal): void {
    setElegido(cliente);
    setDatos(datosDe(cliente));
    setErrorDeRfc(null);
    setError(null);
    setAviso(null);
    leerRemisiones(cliente.id);
  }

  /**
   * La fila viaja al panel. Antes del cambio la FILA lleva el nombre; dentro del
   * cambio se lo quita y se lo pone el panel, y `flushSync` hace que el navegador
   * fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con dos piezas
   * del mismo nombre el navegador no anima ninguna. Por eso el cliente que ya está
   * en el panel se vuelve a abrir sin viaje.
   */
  function abrirDesdeLaFila(clienteId: string): void {
    const cliente = clientes?.find((c) => c.id === clienteId);
    if (cliente === undefined) return;
    if (elegido?.id === clienteId) {
      abrir(cliente);
      return;
    }
    flushSync(() => {
      setViajando(clienteId);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        abrir(cliente);
      });
    });
  }

  function guardar(): void {
    if (elegido === null) return;
    const rfc = datos.rfc.trim().toUpperCase();
    if (rfc !== '' && !rfcConForma(rfc)) {
      setErrorDeRfc('Ese RFC no tiene forma de RFC. Revísalo antes de guardarlo.');
      return;
    }
    setOcupado(true);
    setErrorDeRfc(null);
    setError(null);
    invocarComando<ClienteFiscal>(`${RUTA_CLIENTE}/${elegido.id}`, {
      rfc: rfc === '' ? null : rfc,
      regimenFiscal: datos.regimen.trim() === '' ? null : datos.regimen.trim(),
      usoCfdi: datos.uso,
      codigoPostal: datos.codigoPostal.trim() === '' ? null : datos.codigoPostal.trim(),
    })
      .then((actualizado) => {
        setElegido(actualizado);
        setClientes((previos) =>
          (previos ?? []).map((c) => (c.id === elegido.id ? actualizado : c)),
        );
        setAviso('Guardado. El día que se pueda facturar, ya no habrá que perseguirlo.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function reintentarCarga(): void {
    setFalloDeCarga(null);
    setClientes(null);
    setIntento((previo) => previo + 1);
  }

  function contenido() {
    if (falloDeCarga !== null) {
      return (
        <ErrorDePantalla
          titulo={`No se pudo leer la lista de ${voc.plural('cliente')}`}
          queHacer="Sin la lista no se capturan datos fiscales. Revisa la conexión y vuelve a leerla; no se modificó nada."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={reintentarCarga}>
              Volver a leer
            </Button>
          }
        />
      );
    }
    // La forma de lo que viene: la lista a la izquierda y el panel a la derecha.
    if (clientes === null) {
      return (
        <div className={REJILLA}>
          <EsqueletoDeLista filas={8} />
          <Esqueleto className="hidden h-[50dvh] w-full lg:block" />
        </div>
      );
    }
    if (clientes.length === 0) {
      return (
        <Vacio
          icono={<FileText />}
          titulo="Todavía no hay a quién capturarle datos fiscales."
          explicacion="El contratista aparece cuando le despachas con «Remisión a cuenta» (F11) en el mostrador. Sus datos —RFC, régimen, código postal y uso del CFDI— se piden una sola vez; así, el día que se pueda timbrar, nadie tiene que perseguirlo."
          accion={
            <Button asChild variant="outline">
              <a href="/ferreteria/mostrador">Ir al mostrador</a>
            </Button>
          }
        />
      );
    }
    return (
      <div className={`${REJILLA} lg:items-start`}>
        <Tabla
          etiqueta={`${voc.titulo('cliente', true)} y sus datos fiscales`}
          columnas={columnasDeClientes(voc.titulo('cliente'))}
          filas={clientes}
          claveDe={(c) => c.id}
          {...(elegido === null ? {} : { activa: elegido.id })}
          alActivar={abrirDesdeLaFila}
          viajeDeFila={(c) => (c.id === viajando ? VIAJE.fila(c.id) : undefined)}
          alto="max-h-[40dvh] lg:max-h-[75dvh]"
        />
        {elegido === null ? (
          <Vacio
            icono={<FileText />}
            titulo={`Elige ${voc.enFraseCon('un', 'cliente')} para capturar sus datos.`}
            explicacion="Al abrirlo se ven sus datos fiscales y las remisiones que esperan factura."
            className="py-(--espacio-8)"
          />
        ) : (
          panel(elegido)
        )}
      </div>
    );
  }

  /** El panel en que se convierte la fila: sus datos arriba, su grupo del mes debajo. */
  function panel(cliente: ClienteFiscal) {
    return (
      <Superficie
        como="section"
        aria-labelledby="panel-fiscal"
        relleno={4}
        style={{ viewTransitionName: VIAJE.fila(cliente.id) }}
        className="flex flex-col gap-(--espacio-4)"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
          <h2 id="panel-fiscal" className="text-xl font-semibold">
            {cliente.nombre}
          </h2>
          <span className="text-sm">
            <EstadoFiscal cliente={cliente} />
          </span>
        </div>

        <CamposFiscales datos={datos} errorDeRfc={errorDeRfc} alCambiar={setDatos} />

        {error !== null && (
          <Aviso tono="peligro" titulo="No se guardaron los datos fiscales.">
            {error}
          </Aviso>
        )}
        {aviso !== null && <Aviso tono="exito" titulo={aviso} />}

        <div className="flex justify-end">
          <Button type="button" size="lg" disabled={ocupado} cargando={ocupado} onClick={guardar}>
            Guardar datos fiscales
          </Button>
        </div>

        <section
          aria-labelledby="remisiones-del-periodo"
          className="flex flex-col gap-(--espacio-3) border-t border-borde pt-(--espacio-4)"
        >
          <div className="flex flex-col gap-(--espacio-1)">
            <h3 id="remisiones-del-periodo" className="text-base font-semibold">
              Remisiones del periodo
            </h3>
            <p className="text-sm text-texto-sutil">
              Un contratista se lleva {voc.singular('producto')} quince veces al mes y quiere una
              sola factura.
            </p>
          </div>
          <Remisiones
            remisiones={remisiones}
            fallo={falloDeRemisiones}
            nombre={cliente.nombre}
            alReintentar={() => {
              leerRemisiones(cliente.id);
            }}
          />
        </section>

        {/* El muro de negocio, donde iría la acción principal: TIMBRAR. */}
        <Aviso tono="atencion" titulo="El timbrado está bloqueado hasta que se elija PAC.">
          Mete un costo mensual y una obligación fiscal que no decide una pantalla. Lo de arriba ya
          está construido.
        </Aviso>
      </Superficie>
    );
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-(--espacio-4) p-(--espacio-4) lg:p-(--espacio-6)">
      <header className="flex flex-wrap items-end justify-between gap-(--espacio-4)">
        <div className="flex flex-col gap-(--espacio-1)">
          <h1 className="text-2xl font-semibold">Facturación</h1>
          <p className="text-sm text-texto-sutil">
            Todavía no se timbra. Lo que se hace es dejar el hueco limpio.
          </p>
        </div>
        {clientes !== null && clientes.length > 0 && <ResumenFiscal clientes={clientes} />}
      </header>
      {contenido()}
    </main>
  );
}
