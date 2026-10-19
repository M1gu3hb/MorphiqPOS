import { describe, expect, it } from 'vitest';

import { negocioDeLaDireccion, negocioParaEntrar, rutaDeEmpleados } from './entrada';

describe('el negocio de la dirección', () => {
  it('sale de /n/<slug>/login-pos', () => {
    expect(negocioDeLaDireccion({ pathname: '/n/demo-acople-tienda/login-pos', search: '' })).toBe(
      'demo-acople-tienda',
    );
  });

  it('o de ?negocio= en una pantalla de PIN de un modelo', () => {
    expect(
      negocioDeLaDireccion({
        pathname: '/cafeteria/acceso-por-pin',
        search: '?negocio=demo-acople-cafeteria',
      }),
    ).toBe('demo-acople-cafeteria');
  });

  it('sin ninguna, no nombra a nadie', () => {
    expect(negocioDeLaDireccion({ pathname: '/login-pos', search: '' })).toBeNull();
    expect(negocioDeLaDireccion(undefined)).toBeNull();
  });

  it('un valor sin forma de slug no se manda', () => {
    expect(negocioDeLaDireccion({ pathname: '/login-pos', search: '?negocio=../x' })).toBeNull();
  });

  it('arma la petición de la lista y el cuerpo de la entrada', () => {
    expect(rutaDeEmpleados('demo-acople-tienda')).toBe(
      '/api/auth/empleados?negocio=demo-acople-tienda',
    );
    expect(rutaDeEmpleados(null)).toBe('/api/auth/empleados');
    expect(negocioParaEntrar('demo-acople-tienda')).toEqual({ negocio: 'demo-acople-tienda' });
    expect(negocioParaEntrar(null)).toEqual({});
  });
});
