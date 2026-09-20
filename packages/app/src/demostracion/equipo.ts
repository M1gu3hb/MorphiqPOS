import 'server-only';

import type { Giro } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import { hashearPin } from '../identidad/pin.ts';

/**
 * EL EQUIPO de cada demostración: una persona por cada rol que opera de verdad.
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 * Las cinco demos tenían UN empleado, el dueño que crea `db:bootstrap`. Con uno
 * solo no se puede enseñar nada de lo que este sistema hace: los permisos por
 * rol no se ven —el dueño lo puede todo—, la pantalla de acceso enseña una sola
 * tarjeta, el corte de caja no distingue quién cobró, y la comisión de un salón
 * o la propina de un restaurante no tienen a quién repartirse.
 *
 * Y peor para quien revisa: «entra con el dueño y mira» no prueba que un cajero
 * NO pueda cambiar la plantilla, que es media seguridad del sistema.
 *
 * ── Los PIN, y por qué están aquí escritos ─────────────────────────────────
 * Son de DEMOSTRACIÓN, de cuatro dígitos y **distintos por rol a propósito**,
 * para que al revisar se sepa con quién se entró sin mirar dos veces. Se hashean
 * con Argon2id y pimienta igual que cualquier otro: no hay un camino distinto
 * para sembrar, y nunca se guarda un PIN en claro — precisamente porque «es sólo
 * la demo» es como acaban los PIN en claro en producción.
 *
 * El del DUEÑO no está aquí: lo pone `db:bootstrap` cuando se crea el negocio, y
 * un reseteo de demostración no tiene por qué cambiarle la contraseña a nadie.
 *
 * ── Los nombres ────────────────────────────────────────────────────────────
 * Personas reconocibles y distintas en cada demo, para que al abrir una captura
 * de pantalla se sepa de qué negocio es. No «Usuario 2» ni «Cajero Demo»: una
 * pantalla de acceso con nombres genéricos se ve como un sistema sin terminar.
 */

export interface EmpleadoDemo {
  readonly nombre: string;
  readonly apellidos: string;
  /** Uno de los siete roles del servidor. */
  readonly rol: string;
  readonly pin: string;
  readonly color: string;
}

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
 * Dos estilistas, y no es un adorno: la agenda de un salón se lee POR COLUMNA.
 * Con una sola profesional no hay nada que demostrar del solape, del hueco de
 * las 3 pm ni de la comisión por persona, que son el negocio de este modelo.
 */
const ESTETICA: readonly EmpleadoDemo[] = [
  { nombre: 'Paty', apellidos: 'Villalobos', rol: 'gerente', pin: PIN.gerente, color: '#be123c' },
  { nombre: 'Nayeli', apellidos: 'Cortés', rol: 'cajero', pin: PIN.cajero, color: '#16a34a' },
  { nombre: 'Karla', apellidos: 'Domínguez', rol: 'mesero', pin: PIN.atiende, color: '#7c3aed' },
  { nombre: 'Dany', apellidos: 'Robles', rol: 'mesero', pin: '4568', color: '#c026d3' },
  { nombre: 'Sandra', apellidos: 'Ochoa', rol: 'almacen', pin: PIN.almacen, color: '#0f766e' },
];

export function equipoDelGiro(giro: Giro): readonly EmpleadoDemo[] {
  if (giro === 'restaurante') return RESTAURANTE;
  if (giro === 'cafeteria') return CAFETERIA;
  if (giro === 'ferreteria') return FERRETERIA;
  if (giro === 'estetica') return ESTETICA;
  return TIENDA;
}

/**
 * Siembra el equipo. Devuelve el `empleos.id` de cada persona, por su nombre.
 *
 * Los devuelve porque los necesitan dos cosas: la ficha de profesional de un
 * salón —que cuelga de un empleo— y la sesión de caja, que guarda quién la
 * abrió. Sin eso habría que volver a consultar por nombre, que es la clase de
 * atajo con el que dos personas homónimas rompen una demostración.
 *
 * Es idempotente por (organización, nombre, apellidos): correrlo dos veces no
 * duplica a nadie, y devuelve igual el empleo de quien ya estaba.
 */
export async function sembrarEquipo(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  giro: Giro,
  pimienta: string,
): Promise<Map<string, string>> {
  const empleos = new Map<string, string>();

  for (const empleado of equipoDelGiro(giro)) {
    const clave = `${empleado.nombre} ${empleado.apellidos}`;

    const yaEsta = await tx
      .selectFrom('personas')
      .innerJoin('empleos', 'empleos.persona_id', 'personas.id')
      .select(['empleos.id as empleoId'])
      .where('personas.organizacion_id', '=', organizacionId)
      .where('personas.nombre', '=', empleado.nombre)
      .where('personas.apellidos', '=', empleado.apellidos)
      .executeTakeFirst();
    if (yaEsta !== undefined) {
      empleos.set(clave, yaEsta.empleoId);
      continue;
    }

    const persona = await tx
      .insertInto('personas')
      .values({
        organizacion_id: organizacionId,
        nombre: empleado.nombre,
        apellidos: empleado.apellidos,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // `identidades` y `credenciales_pin` NO llevan `organizacion_id`: cuelgan de
    // la persona, que sí lo lleva. El ámbito viaja por la relación, no repetido.
    const identidad = await tx
      .insertInto('identidades')
      .values({ persona_id: persona.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    const empleo = await tx
      .insertInto('empleos')
      .values({
        organizacion_id: organizacionId,
        persona_id: persona.id,
        sucursal_id: sucursalId,
        rol: empleado.rol,
        color: empleado.color,
        // Quien prepara ve TODAS las estaciones: en un negocio de doce mesas no
        // hay un cocinero por estación, y filtrarle la mitad de las comandas
        // sería enseñar una pantalla que miente sobre lo que falta por salir.
        ve_todas_las_estaciones: empleado.rol === 'cocina',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await tx
      .insertInto('credenciales_pin')
      .values({
        identidad_id: identidad.id,
        pin_hash: await hashearPin(empleado.pin, pimienta),
      })
      .execute();

    empleos.set(clave, empleo.id);
  }

  return empleos;
}
