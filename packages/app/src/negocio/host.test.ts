import { describe, expect, it } from 'vitest';

import { slugDelHost } from './despliegue.ts';

/**
 * El negocio sale de la PETICIÓN, no de una variable del build (E5).
 *
 * `ORGANIZACION` se aplica al construir y es la misma para todas las peticiones,
 * así que con ella **un despliegue sólo puede servir a un negocio**. Miguel tiene
 * cuatro y hay cinco demostraciones. El host de la petición es lo que permite que
 * el mismo despliegue sirva a los nueve.
 *
 * Esto prueba la parte que se puede probar sin base: qué etiqueta se va a buscar.
 * Que la etiqueta EXISTA se comprueba contra la tabla, y un host que no es de
 * nadie cae a `ORGANIZACION` en vez de fallar.
 */
describe('el slug que viaja en el host', () => {
  it('la primera etiqueta es el slug', () => {
    expect(slugDelHost('mh-restaurante.morphiqpos.app')).toBe('mh-restaurante');
    expect(slugDelHost('demo-acople-tienda.morphiqpos.app')).toBe('demo-acople-tienda');
  });

  it('el puerto y las mayúsculas no cuentan', () => {
    // El host llega tal cual lo mandó el navegador: con puerto en desarrollo, y
    // en la caja que sea, con la caja de mayúsculas que sea.
    expect(slugDelHost('MH-Restaurante.MorphiqPOS.app:3000')).toBe('mh-restaurante');
    expect(slugDelHost('  demo-acople-estetica.morphiqpos.app  ')).toBe('demo-acople-estetica');
  });

  it('un host SIN punto no lleva slug', () => {
    // `localhost` no es un negocio, y tratarlo como slug haría una consulta por
    // cada petición de desarrollo.
    expect(slugDelHost('localhost')).toBeNull();
    expect(slugDelHost('localhost:3000')).toBeNull();
  });

  it('las etiquetas genéricas no son negocios', () => {
    for (const host of [
      'www.morphiqpos.app',
      'app.morphiqpos.app',
      'api.morphiqpos.app',
      'admin.morphiqpos.app',
      'staging.morphiqpos.app',
      'preview.morphiqpos.app',
    ]) {
      expect(slugDelHost(host), `«${host}» no puede leerse como un negocio`).toBeNull();
    }
  });

  it('lo que no tiene forma de slug no se consulta', () => {
    // Un slug es `[a-z0-9][a-z0-9-]{1,62}`. Lo demás no llega a la base: no es la
    // seguridad —un slug se comprueba contra la tabla— es no consultar por basura.
    expect(slugDelHost('')).toBeNull();
    expect(slugDelHost(null)).toBeNull();
    expect(slugDelHost(undefined)).toBeNull();
    expect(slugDelHost('a.morphiqpos.app')).toBeNull(); // una sola letra
    expect(slugDelHost('-mal.morphiqpos.app')).toBeNull();
    expect(slugDelHost('con_guion_bajo.morphiqpos.app')).toBeNull();
    expect(slugDelHost('con espacio.morphiqpos.app')).toBeNull();
    expect(slugDelHost("o'brien.morphiqpos.app")).toBeNull();
  });

  it('una IP no se lee como negocio', () => {
    // `192.168.1.10` da `192` como primera etiqueta, y `192` SÍ tiene forma de
    // slug. No sería un agujero —ninguna organización se llama así y la consulta
    // no encontraría nada— pero una etiqueta de sólo dígitos es un octeto, no un
    // nombre, y se descarta antes de consultar.
    expect(slugDelHost('192.168.1.10')).toBeNull();
    expect(slugDelHost('10.0.0.5:3000')).toBeNull();
  });

  it('el host de un preview de Vercel no es un negocio', () => {
    // `morphiqpos-git-fase-2-mh-astral-systems.vercel.app` da esa etiqueta larga
    // como candidata, y ninguna organización se llama así. Cae a ORGANIZACION,
    // que es lo que el preview tiene puesto.
    expect(slugDelHost('morphiqpos-git-fase-2-mh-astral-systems.vercel.app')).toBe(
      'morphiqpos-git-fase-2-mh-astral-systems',
    );
  });
});
