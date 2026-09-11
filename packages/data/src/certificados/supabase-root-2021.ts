/**
 * Raíz pública con la que Supabase firma el certificado de sus bases.
 *
 * **Va embebida como texto y no se lee del disco.** En una función serverless el
 * trazado de archivos de Next decide qué se copia al bundle a partir de lo que
 * ve en el código, y un `readFileSync` sobre una ruta construida no siempre lo
 * convence. El síntoma sería el peor posible: funciona en local, y en
 * producción la primera consulta muere con «self-signed certificate» — o peor,
 * alguien lo arregla poniendo `rejectUnauthorized: false` y el canal se queda
 * cifrado pero sin autenticar.
 *
 * No es un secreto: se publica en
 * `https://supabase-downloads.s3.amazonaws.com/prod/ssl/prod-ca-2021.crt`.
 *
 *     subject  CN=Supabase Root 2021 CA, O=Supabase Inc
 *     válido   2021-04-28 → 2031-04-26
 *
 * Cuando Supabase rote su raíz habrá que traer la nueva y dejar las dos
 * mientras dure el solape. `verificar-certificado.mjs` avisa 90 días antes.
 */
const SALTO = String.fromCharCode(10);

export const RAIZ_SUPABASE = [
  '-----BEGIN CERTIFICATE-----',
  'MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL',
  'BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l',
  'dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh',
  'c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow',
  'azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD',
  'YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug',
  'Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW',
  'QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q',
  'DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2',
  'GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi',
  'cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4',
  'O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt',
  'NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX',
  'uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt',
  'aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU',
  'tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b',
  'VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6',
  'jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx',
  'Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2',
  'CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P',
  'o/bKiIz+Fq8=',
  '-----END CERTIFICATE-----',
].join(SALTO);
