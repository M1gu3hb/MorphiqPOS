import { describe, expect, it } from 'vitest';

import { accionDeTeclaEnLaAgenda } from './atajos-de-la-agenda.ts';

const tecla = (
  key: string,
  cambios: Partial<Parameters<typeof accionDeTeclaEnLaAgenda>[0]> = {},
) => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  target: null,
  ...cambios,
});

describe('los atajos de la agenda', () => {
  it('cada tecla del documento hace lo suyo', () => {
    expect(
      ['ArrowLeft', 'ArrowRight', 'h', 'N', 'w', '/', 'Escape'].map((k) =>
        accionDeTeclaEnLaAgenda(tecla(k)),
      ),
    ).toEqual(['anterior', 'siguiente', 'hoy', 'nueva', 'walk_in', 'buscar', 'cerrar']);
  });

  it('una tecla que no es suya no hace nada', () => {
    expect(accionDeTeclaEnLaAgenda(tecla('x'))).toBeNull();
  });

  it('dentro de un campo no se roba ninguna tecla, salvo ESC', () => {
    // La «n» es de quien escribe un nombre; ESC cierra el cajón aunque el foco esté
    // en su buscador.
    const campo = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
    const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;
    expect(accionDeTeclaEnLaAgenda(tecla('n', { target: campo }))).toBeNull();
    expect(accionDeTeclaEnLaAgenda(tecla('ArrowLeft', { target: editable }))).toBeNull();
    expect(accionDeTeclaEnLaAgenda(tecla('Escape', { target: campo }))).toBe('cerrar');
    const boton = { tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget;
    expect(accionDeTeclaEnLaAgenda(tecla('n', { target: boton }))).toBe('nueva');
  });

  it('con Ctrl, Alt o Cmd la combinación es del navegador', () => {
    expect(accionDeTeclaEnLaAgenda(tecla('n', { ctrlKey: true }))).toBeNull();
    expect(accionDeTeclaEnLaAgenda(tecla('ArrowLeft', { altKey: true }))).toBeNull();
    expect(accionDeTeclaEnLaAgenda(tecla('h', { metaKey: true }))).toBeNull();
  });
});
