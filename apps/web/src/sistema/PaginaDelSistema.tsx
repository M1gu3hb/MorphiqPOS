'use client';

import { useState } from 'react';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  AbanicoInferior,
  Aviso,
  BarraFija,
  Cifra,
  ConfirmacionDestructiva,
  Dinero,
  ErrorDePantalla,
  EsqueletoDeLista,
  GraficaDeAreaApilada,
  GraficaDeBarras,
  GraficaDeDona,
  GraficaDeLineas,
  IndicadorDeGuardado,
  Isla,
  ListaDeTarjetas,
  MapaDeCalorPorHora,
  Migas,
  Progreso,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
  type EstadoDeGuardado,
  type NivelDeElevacion,
} from '@morphiqpos/ui/sistema';
import { CLAVES_ESTILO, ESTILOS, PERILLAS } from '@morphiqpos/ui/tokens';

import { useAparienciaEnVivo } from '~/proveedores/Apariencia';

/**
 * LA PÁGINA VIVA DEL SISTEMA · `/sistema`.
 *
 * ── Por qué una página en la aplicación y no un Storybook ─────────────────
 * Un Storybook es un segundo proyecto: su build, su configuración, sus mocks y su
 * copia de los estilos. Y la copia es el problema —no el coste—: en cuanto diverge,
 * la documentación enseña un botón que ya no es el botón. Esta página corre DENTRO
 * de la aplicación, con sus proveedores, sus tokens y su CSS. Lo que aquí se ve es
 * literalmente lo que la caja va a ver.
 *
 * Y hace una segunda cosa que un Storybook no puede hacer: **cambiar el estilo y las
 * cuatro perillas en vivo**, sobre estas mismas piezas. Es donde se comprueba de un
 * vistazo que un estilo nuevo no rompe la tabla densa, ni el diálogo de cobro, ni la
 * gráfica —que es exactamente donde se cae un sistema de estilos—.
 */

interface FilaDeEjemplo {
  readonly clave: string;
  readonly producto: string;
  readonly existencia: number;
  readonly precioCentavos: number;
}

const FILAS: readonly FilaDeEjemplo[] = [
  { clave: '7501', producto: 'Café de olla', existencia: 42, precioCentavos: 3500 },
  { clave: '7502', producto: 'Concha de vainilla', existencia: 8, precioCentavos: 1800 },
  { clave: '7503', producto: 'Jugo de naranja 1 L', existencia: 0, precioCentavos: 4200 },
  { clave: '7504', producto: 'Tamal verde', existencia: 120, precioCentavos: 2500 },
];

const COLUMNAS: readonly ColumnaDeTabla<FilaDeEjemplo>[] = [
  {
    clave: 'clave',
    titulo: 'Clave',
    celda: (fila) => <span className="font-numeros">{fila.clave}</span>,
    orden: (fila) => fila.clave,
  },
  {
    clave: 'producto',
    titulo: 'Producto',
    celda: (fila) => fila.producto,
    orden: (fila) => fila.producto,
  },
  {
    clave: 'existencia',
    titulo: 'Existencia',
    numerica: true,
    celda: (fila) => <Cifra valor={fila.existencia} unidad="pz" tamano="sm" />,
    orden: (fila) => fila.existencia,
    desde: 'sm',
  },
  {
    clave: 'precio',
    titulo: 'Precio',
    numerica: true,
    celda: (fila) => <Dinero centavos={fila.precioCentavos} tamano="sm" />,
    orden: (fila) => fila.precioCentavos,
  },
];

function Seccion({
  titulo,
  cuando,
  children,
}: {
  readonly titulo: string;
  /** CUÁNDO se usa esto. Sin esta línea, un catálogo es una vitrina. */
  readonly cuando: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-(--espacio-4) border-t border-border pt-(--espacio-8)">
      <header className="flex flex-col gap-(--espacio-1)">
        <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{cuando}</p>
      </header>
      {children}
    </section>
  );
}

export function PaginaDelSistema() {
  const { apariencia, cambiarEstilo, ajustar } = useAparienciaEnVivo();
  const [activa, setActiva] = useState<string>('7502');
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set(['7501']));
  const [confirmando, setConfirmando] = useState(false);
  const [guardado, setGuardado] = useState<EstadoDeGuardado>('quieto');
  const [cargando, setCargando] = useState(false);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <BarraFija className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-(--espacio-3) px-(--espacio-4) py-(--espacio-4)">
          <Migas pasos={[{ rotulo: 'MorphiqPOS' }, { rotulo: 'Sistema de diseño' }]} />
          <h1 className="text-2xl font-semibold tracking-tight">El sistema, en vivo</h1>

          {/* EL SELECTOR · el estilo y las cuatro perillas, sobre estas mismas
              piezas. Cambiar aquí no recarga nada: son cinco atributos del <html>. */}
          <div className="flex flex-wrap items-end gap-(--espacio-4)">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Estilo
              <select
                value={apariencia.estilo}
                onChange={(evento) => {
                  cambiarEstilo(evento.target.value);
                }}
                className="h-(--altura-control) rounded-md border border-input bg-card px-(--espacio-2) text-sm text-foreground"
              >
                {CLAVES_ESTILO.map((clave) => (
                  <option key={clave} value={clave}>
                    {ESTILOS[clave]?.nombre ?? clave}
                  </option>
                ))}
              </select>
            </label>

            {(['densidad', 'redondeo', 'elevacion', 'movimiento'] as const).map((perilla) => (
              <label key={perilla} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {perilla[0]?.toUpperCase()}
                {perilla.slice(1)}
                <select
                  value={apariencia[perilla]}
                  onChange={(evento) => {
                    // El valor viene del catálogo de la perilla, así que es uno de
                    // los suyos: lo garantiza la lista que pinta las opciones.
                    ajustar(perilla, evento.target.value as never);
                  }}
                  className="h-(--altura-control) rounded-md border border-input bg-card px-(--espacio-2) text-sm text-foreground"
                >
                  {PERILLAS[perilla].map((valor) => (
                    <option key={valor} value={valor}>
                      {valor}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{ESTILOS[apariencia.estilo]?.para ?? ''}</p>
        </div>
      </BarraFija>

      <main className="mx-auto flex max-w-5xl flex-col gap-(--espacio-8) px-(--espacio-4) py-(--espacio-8)">
        <Seccion
          titulo="Superficies"
          cuando="Cinco niveles con una sola lógica de luz. El nivel dice a qué altura está algo: 1 una tarjeta en reposo, 3 lo que flota, 4 lo que bloquea."
        >
          <div className="grid grid-cols-2 gap-(--espacio-4) sm:grid-cols-5">
            {([0, 1, 2, 3, 4] as const).map((nivel: NivelDeElevacion) => (
              <Superficie key={nivel} nivel={nivel} className="text-center text-sm">
                <p className="font-medium">nivel {nivel}</p>
                <p className="text-xs text-muted-foreground">
                  {['sección', 'tarjeta', 'levantada', 'flota', 'bloquea'][nivel]}
                </p>
              </Superficie>
            ))}
          </div>
        </Seccion>

        <Seccion
          titulo="Controles"
          cuando="Seis intenciones. Una por pantalla manda: la primaria es la acción principal, y si hay dos primarias no hay ninguna."
        >
          <div className="flex flex-wrap items-center gap-(--espacio-2)">
            <Button>Cobrar</Button>
            <Button variant="success">Confirmar</Button>
            <Button variant="secondary">Guardar borrador</Button>
            <Button variant="outline">Ver detalle</Button>
            <Button variant="ghost">Cancelar</Button>
            <Button variant="destructive">Eliminar</Button>
            <Button variant="link">¿Qué es esto?</Button>
          </div>
          {/* La fila de TAMAÑOS respira más que la de variantes, y no por estética:
              `xs` y `sm` quedan por debajo del objetivo táctil de su densidad, así que
              lo que les permite pasar es la separación —la excepción de WCAG 2.5.8—. A
              `gap-(--espacio-2)` quedaban a 11 px con guantes y no se aciertan. */}
          <div className="flex flex-wrap items-center gap-(--espacio-4)">
            <Button size="xs">xs</Button>
            <Button size="sm">sm</Button>
            <Button>normal</Button>
            <Button size="lg">lg</Button>
            <Button disabled>deshabilitado</Button>
            <Button
              cargando={cargando}
              onClick={() => {
                setCargando(true);
                setTimeout(() => {
                  setCargando(false);
                }, 1_800);
              }}
            >
              {cargando ? 'Cobrando…' : 'Tócame: cargando'}
            </Button>
            {/* EL BOTÓN QUE ES UN ENLACE · `asChild`.
                No es un adorno de catálogo: es el modo que usan todos los estados
                vacíos y todos los atajos de los tableros —«Ir a caja», «Ver el mapa»—,
                y faltaba en esta página. Faltando aquí, el día que `asChild` se rompió
                —`Slot` exige UN hijo y recibía dos— esta página siguió en verde
                mientras media aplicación moría al hidratar. Lo que no está aquí no lo
                mira la puerta de los ocho estilos. */}
            <Button asChild variant="outline">
              <a href="/sistema">Botón que es un enlace</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Púlsalos y no los sueltes: el hundimiento de 1 px y la sombra que se acorta son lo que
            hace que un botón se sienta real.
          </p>
        </Seccion>

        <Seccion
          titulo="Dinero"
          cuando="Lo que más se mira en todo el sistema. Cifras tabulares siempre, el símbolo más pequeño que el número, y los negativos en rojo Y entre paréntesis."
        >
          <div className="flex flex-wrap items-end gap-(--espacio-6)">
            <Dinero centavos={43900} tamano="total" />
            <Dinero centavos={123450} tamano="lg" />
            <Dinero centavos={3500} />
            <Dinero centavos={-28000} />
            <Dinero centavos={15000} conSigno />
            <Cifra valor={12.5} unidad="kg" decimales={2} />
          </div>
        </Seccion>

        <Seccion
          titulo="Datos"
          cuando="La tabla en PC; la misma definición de columnas, en tarjetas, para tableta y teléfono."
        >
          <Tabla
            columnas={COLUMNAS}
            filas={FILAS}
            claveDe={(fila) => fila.clave}
            activa={activa}
            alActivar={setActiva}
            seleccion={{ elegidas, alCambiar: setElegidas }}
            alto="max-h-64"
          />
          <ListaDeTarjetas
            columnas={COLUMNAS}
            filas={FILAS.slice(0, 2)}
            claveDe={(fila) => fila.clave}
            principal="producto"
            alActivar={setActiva}
          />
        </Seccion>

        <Seccion
          titulo="Vacío, cargando y error"
          cuando="Los tres estados que siempre se olvidan, y los tres se ven más que el caso feliz el primer día de un negocio."
        >
          <div className="grid gap-(--espacio-4) md:grid-cols-3">
            <Superficie relleno={0}>
              <Vacio
                titulo="Todavía no hay nada aquí"
                explicacion="Un vacío sin salida es una pared. Éste enseña por dónde empezar."
                accion={<Button size="sm">Importar desde Excel</Button>}
              />
            </Superficie>
            <Superficie>
              <EsqueletoDeLista filas={4} />
            </Superficie>
            <ErrorDePantalla
              titulo="No se pudo traer el catálogo"
              queHacer="Revisa la conexión y vuelve a intentarlo. Lo que ya está en pantalla sigue sirviendo."
              detalle="ALMACEN_NO_DISPONIBLE"
              reintentar={
                <Button size="sm" variant="outline">
                  Reintentar
                </Button>
              }
            />
          </div>
        </Seccion>

        <Seccion
          titulo="Gráficas"
          cuando="Cinco tipos, con los colores del estilo activo. Cada indicador existe porque hay una decisión que alguien toma al verlo."
        >
          <div className="grid gap-(--espacio-6) md:grid-cols-2">
            <Superficie>
              <GraficaDeBarras
                titulo="Ticket promedio por mesero"
                ejes={['Lupita', 'Toño', 'Rosa', 'Beatriz']}
                series={[{ etiqueta: 'Promedio', valores: [318, 402, 275, 361] }]}
                formato={(valor) => `$${String(valor)}`}
              />
            </Superficie>
            <Superficie>
              <GraficaDeLineas
                titulo="Venta de la semana"
                ejes={['L', 'M', 'M', 'J', 'V', 'S', 'D']}
                series={[
                  { etiqueta: 'Esta semana', valores: [12, 18, 15, 22, 34, 41, 28] },
                  { etiqueta: 'Semana pasada', valores: [10, 15, 17, 19, 30, 38, 31] },
                ]}
              />
            </Superficie>
            <Superficie>
              <GraficaDeAreaApilada
                titulo="De qué se compone la venta"
                ejes={['L', 'M', 'M', 'J', 'V']}
                series={[
                  { etiqueta: 'Mostrador', valores: [8, 10, 9, 14, 20] },
                  { etiqueta: 'Para llevar', valores: [4, 6, 5, 7, 12] },
                  { etiqueta: 'Reparto', valores: [2, 3, 4, 3, 6] },
                ]}
              />
            </Superficie>
            <Superficie>
              <GraficaDeDona
                titulo="Cómo se cobró hoy"
                etiquetaCentro="cobrado"
                partes={[
                  { etiqueta: 'Efectivo', valor: 6200 },
                  { etiqueta: 'Tarjeta', valor: 3400 },
                  { etiqueta: 'Transferencia', valor: 900 },
                ]}
                formato={(valor) => `$${valor.toLocaleString('es-MX')}`}
              />
            </Superficie>
          </div>
          <Superficie>
            <MapaDeCalorPorHora
              titulo="A qué hora hay gente"
              horas={['9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']}
              dias={['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']}
              valores={[
                [1, 2, 4, 9, 14, 12, 6, 3, 4, 7, 9, 5],
                [1, 2, 5, 10, 15, 11, 5, 3, 4, 8, 10, 6],
                [2, 3, 5, 11, 16, 13, 6, 4, 5, 9, 11, 7],
                [2, 3, 6, 12, 18, 14, 7, 4, 6, 11, 14, 9],
                [3, 5, 8, 16, 24, 19, 10, 7, 9, 16, 22, 15],
                [5, 9, 14, 22, 28, 24, 16, 12, 14, 20, 26, 18],
                [4, 7, 12, 20, 25, 20, 12, 8, 9, 12, 14, 8],
              ]}
              formato={(valor) => `${String(valor)} cuentas`}
            />
          </Superficie>
        </Seccion>

        <Seccion
          titulo="Retroalimentación"
          cuando="Decir qué pasó sin estorbar lo que se está haciendo. Y confirmar lo destructivo con el nombre de lo que se va a borrar."
        >
          <div className="grid gap-(--espacio-4) md:grid-cols-2">
            <Aviso tono="info" titulo="El corte se hace a ciegas">
              Nunca se enseña lo esperado antes de contar.
            </Aviso>
            <Aviso tono="exito" titulo="Cobrado $439.00" />
            <Aviso tono="atencion" titulo="Quedan 3 piezas de Concha de vainilla" />
            <Aviso tono="peligro" titulo="No se pudo cobrar con tarjeta">
              La terminal no contestó. Cobra en efectivo o vuelve a intentarlo.
            </Aviso>
          </div>
          <div className="flex flex-wrap items-center gap-(--espacio-6)">
            <Progreso valor={62} etiqueta="Importando productos" className="w-64" />
            <Progreso etiqueta="Sincronizando" className="w-64" />
            <div className="flex items-center gap-(--espacio-3)">
              <Input
                placeholder="Escribe para ver el indicador"
                onChange={() => {
                  setGuardado('guardando');
                  setTimeout(() => {
                    setGuardado('guardado');
                  }, 900);
                }}
                className="w-64"
              />
              <IndicadorDeGuardado estado={guardado} />
            </div>
          </div>
          <div>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmando(true);
              }}
            >
              Eliminar «Concha de vainilla»
            </Button>
            <ConfirmacionDestructiva
              abierta={confirmando}
              queSeBorra="Concha de vainilla"
              consecuencia="Sus movimientos de inventario se conservan, pero dejará de poder venderse."
              alConfirmar={() => {
                setConfirmando(false);
              }}
              alCancelar={() => {
                setConfirmando(false);
              }}
            />
          </div>
        </Seccion>

        <Seccion
          titulo="Navegación"
          cuando="Tres formas para tres dispositivos, no una que se encoge. El abanico inferior es del teléfono; la barra lateral, de la PC y la tableta."
        >
          <p className="text-sm text-muted-foreground">
            El abanico está abajo del todo, fijo, para que se pueda tocar con el pulgar. La barra
            lateral vive en el marco de la aplicación.
          </p>
          <AbanicoInferior
            destinos={[
              { clave: 'cobrar', rotulo: 'Cobrar', icono: <span aria-hidden="true">$</span> },
              {
                clave: 'mesas',
                rotulo: 'Mesas',
                icono: <span aria-hidden="true">▦</span>,
                insignia: 3,
              },
              { clave: 'caja', rotulo: 'Caja', icono: <span aria-hidden="true">▣</span> },
            ]}
            activo="cobrar"
            alIr={() => undefined}
          />
        </Seccion>

        {/* La isla queda al final para que no tape las secciones de arriba. */}
        <Isla>
          <span className="flex items-center gap-(--espacio-4) px-(--espacio-2) text-sm">
            <span className="text-muted-foreground">Total</span>
            <Dinero centavos={43900} tamano="lg" />
            <Button size="sm">Cobrar</Button>
          </span>
        </Isla>

        <p className="pb-32 text-xs text-muted-foreground">
          Cambia el estilo y las perillas de arriba: nada de esta página se vuelve a montar, y lo
          que ves es lo mismo que ve la caja.
        </p>
      </main>
    </div>
  );
}
