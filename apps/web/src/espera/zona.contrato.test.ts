import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * CONTRATO (PAR-1): la hora del modo espera es la del NEGOCIO. En Don Poncho la zona estaba fija
 * en `ModoEspera.tsx`; en el maestro la lee el servidor de `organizaciones.zona_horaria` al pintar
 * (`app/layout.tsx`) y llega por la experiencia del negocio. Ninguna zona escrita a mano.
 */
const WEB = join(import.meta.dirname, '..', '..');
const leer = (ruta: string): string => readFileSync(join(WEB, ruta), 'utf8');

describe('contrato: la zona horaria del modo espera sale del negocio', () => {
  it('el modo espera no trae una zona escrita a mano y usa la de la experiencia', () => {
    const modo = leer('src/espera/ModoEspera.tsx');
    expect(modo).not.toMatch(/['"](America|Europe|UTC)[/'"]/);
    expect(modo).toMatch(/const \{[^}]*\bzona\b[^}]*\} = useExperiencia\(\)/);
    expect(modo).toMatch(/zona=\{zona\}/);
  });

  it('el servidor la lee del negocio al pintar y la pasa a los proveedores', () => {
    const layout = leer('app/layout.tsx');
    expect(layout).toMatch(/zonaHorariaDeLaOrganizacion\(organizacionId\)/);
    expect(layout).toMatch(/zona=\{zona\}/);
    expect(leer('src/proveedores/Proveedores.tsx')).toMatch(/<ProveedorDeExperiencia[^>]*zona/);
  });
});
