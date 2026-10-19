/**
 * EL EQUIPO DE CADA DEMOSTRACIÓN: una persona por cada rol que opera de verdad.
 *
 * ── Por qué vive aquí y no en el servidor ─────────────────────────────────────
 * Hasta la 2.4 esta tabla estaba en `packages/app/src/demostracion/equipo.ts`, que es
 * `server-only`, y las pruebas de extremo a extremo tenían su propia copia en prosa
 * (`ACCESOS-DEMO.md §2`). El día completo de cada giro (bloque D de la 2.4) entra con el
 * ROL que toca a cada paso —la cajera cobra, el mesero comanda, la estilista ve su
 * día—, y para eso necesita saber quién es quién y con qué PIN. Una segunda copia se
 * queda atrás en silencio: la siembra cambia un nombre y la prueba busca una tarjeta
 * que ya no existe. Aquí la leen las dos.
 *
 * ── Los PIN, y por qué están aquí escritos ───────────────────────────────────
 * Son de DEMOSTRACIÓN, de cuatro dígitos y distintos por rol a propósito, para que al
 * revisar se sepa con quién se entró sin mirar dos veces. La siembra los hashea con
 * Argon2id y pimienta igual que cualquier otro: no hay un camino distinto para sembrar.
 * El repositorio es público y estos PIN también lo son: abren las cinco demos y nada
 * más, porque el reseteo sólo corre sobre `DEMOS` (bloque B).
 *
 * ── Los nombres ──────────────────────────────────────────────────────────────
 * Personas reconocibles y distintas en cada demo, para que al abrir una captura se sepa
 * de qué negocio es. No «Usuario 2» ni «Cajero Demo».
 *
 * No depende de nada, igual que el resto de este directorio.
 */

/** Los cinco giros que tienen demostración. `farmacia` no tiene modelo todavía. */
export type GiroDeDemo = 'restaurante' | 'cafeteria' | 'tienda' | 'ferreteria' | 'estetica';

export interface EmpleadoDemo {
  readonly nombre: string;
  readonly apellidos: string;
  /** Uno de los siete roles del servidor. */
  readonly rol: string;
  readonly pin: string;
  readonly color: string;
}

/**
 * El dueño de cada demo: lo crea `db:bootstrap` cuando nace el negocio y el reseteo le
 * repone este PIN. Se llama «Demo» en las cinco, a propósito: es quien enseña.
 */
export const DUENO_DE_DEMO = { nombre: 'Demo', rol: 'dueno', pin: '1234' } as const;

/** El PIN de cada rol. Distintos para que se distingan al revisar. */
const PIN = {
  gerente: '2345',
  cajero: '3456',
  atiende: '4567',
  prepara: '5678',
  almacen: '6789',
} as const;

const RESTAURANTE: readonly EmpleadoDemo[] = [
  { nombre: 'Beatriz', apellidos: 'Salgado', rol: 'gerente', pin: PIN.gerente, color: '#be123c' },
  { nombre: 'Rosa', apellidos: 'Miranda', rol: 'cajero', pin: PIN.cajero, color: '#16a34a' },
  { nombre: 'Lupita', apellidos: 'Ramírez', rol: 'mesero', pin: PIN.atiende, color: '#7c3aed' },
  { nombre: 'Toño', apellidos: 'Barrera', rol: 'cocina', pin: PIN.prepara, color: '#d97706' },
  { nombre: 'Nacho', apellidos: 'Peralta', rol: 'almacen', pin: PIN.almacen, color: '#0f766e' },
];

const CAFETERIA: readonly EmpleadoDemo[] = [
  { nombre: 'Fernanda', apellidos: 'Lozano', rol: 'gerente', pin: PIN.gerente, color: '#be123c' },
  { nombre: 'Diana', apellidos: 'Arreola', rol: 'cajero', pin: PIN.cajero, color: '#16a34a' },
  // El barista PREPARA: su rol en el servidor es `cocina`, y su pantalla es la
  // barra. El nombre que lee en el menú lo pone el diccionario del giro.
  { nombre: 'Emilio', apellidos: 'Cázares', rol: 'cocina', pin: PIN.prepara, color: '#d97706' },
  { nombre: 'Sergio', apellidos: 'Pineda', rol: 'almacen', pin: PIN.almacen, color: '#0f766e' },
];

const TIENDA: readonly EmpleadoDemo[] = [
  { nombre: 'Laura', apellidos: 'Beltrán', rol: 'gerente', pin: PIN.gerente, color: '#be123c' },
  { nombre: 'Jesica', apellidos: 'Ovalle', rol: 'cajero', pin: PIN.cajero, color: '#16a34a' },
  { nombre: 'Poncho', apellidos: 'Mendoza', rol: 'almacen', pin: PIN.almacen, color: '#0f766e' },
];

const FERRETERIA: readonly EmpleadoDemo[] = [
  { nombre: 'Elena', apellidos: 'Zúñiga', rol: 'gerente', pin: PIN.gerente, color: '#be123c' },
  // El mostradorista COBRA: su rol es `cajero`. La palabra la pone el giro.
  { nombre: 'Karla', apellidos: 'Estrada', rol: 'cajero', pin: PIN.cajero, color: '#16a34a' },
  { nombre: 'Rubén', apellidos: 'Garza', rol: 'almacen', pin: PIN.almacen, color: '#0f766e' },
];

/**
 * Dos estilistas, y no es un adorno: la agenda de un salón se lee POR COLUMNA. Con una
 * sola profesional no hay nada que demostrar del solape, del hueco de las 3 pm ni de la
 * comisión por persona. Su rol en la base es `mesero` (la estilista atiende) y el giro
 * la nombra «Estilista» (A.8 de la 2.4): sólo vocabulario, ningún rol nuevo.
 */
const ESTETICA: readonly EmpleadoDemo[] = [
  { nombre: 'Paty', apellidos: 'Villalobos', rol: 'gerente', pin: PIN.gerente, color: '#be123c' },
  { nombre: 'Nayeli', apellidos: 'Cortés', rol: 'cajero', pin: PIN.cajero, color: '#16a34a' },
  { nombre: 'Karla', apellidos: 'Domínguez', rol: 'mesero', pin: PIN.atiende, color: '#7c3aed' },
  { nombre: 'Dany', apellidos: 'Robles', rol: 'mesero', pin: '4568', color: '#c026d3' },
  { nombre: 'Sandra', apellidos: 'Ochoa', rol: 'almacen', pin: PIN.almacen, color: '#0f766e' },
];

/** El equipo sembrado de cada giro con demo. Sin el dueño: ése es `DUENO_DE_DEMO`. */
export const EQUIPO_DE_DEMO: Readonly<Record<GiroDeDemo, readonly EmpleadoDemo[]>> = {
  restaurante: RESTAURANTE,
  cafeteria: CAFETERIA,
  tienda: TIENDA,
  ferreteria: FERRETERIA,
  estetica: ESTETICA,
};

const GIROS_CON_DEMO: readonly string[] = Object.keys(EQUIPO_DE_DEMO);

/** ¿Este giro tiene equipo de demostración propio? */
export function esGiroDeDemo(giro: string): giro is GiroDeDemo {
  return GIROS_CON_DEMO.includes(giro);
}

/**
 * El equipo de un giro. Un giro sin demo propia —`farmacia`— siembra el de la tienda,
 * que es la plantilla con la que se da de alta.
 */
export function equipoDeDemo(giro: string): readonly EmpleadoDemo[] {
  return esGiroDeDemo(giro) ? EQUIPO_DE_DEMO[giro] : TIENDA;
}
