# VOCES · qué suena hoy, qué se puede elegir y qué motor sería el siguiente

Evaluación escrita el 20-10-2026 para decidir cómo mejorar la voz de los avisos («Mesa cuatro, su
orden está lista»). **Nada de lo que se evalúa aquí está integrado.** Lo único que cambió en el
código es la voz del NAVEGADOR, que ahora se puede elegir por dispositivo (primera sección).

## 1 · Lo que sí está hecho: elegir la voz del dispositivo

El sistema avisa con la Web Speech API (`speechSynthesis`), es decir, con las voces que el sistema
operativo del propio dispositivo trae instaladas. No cuesta nada, no necesita servidor y funciona sin
internet con las voces locales.

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Pantalla de elección | `apps/web/heredado/components/configuracion/ConfiguracionDeVoz.jsx` | Lista SOLO las voces en español que este dispositivo tiene, escucha una muestra de cada una y guarda la elegida. **Se monta con `<ConfiguracionDeVoz />`** (sin props) donde Configuración lo decida; no está montada todavía |
| Lógica pura | `apps/web/src/voz/voces.ts` | Qué es español (también `es_MX` de Android), qué puede sonar ahora, en qué orden se ofrece y cómo se llama en pantalla |
| Preferencia | `apps/web/src/voz/preferencia-de-voz.ts` | Lee y escribe en `localStorage` con `try/catch`. Claves: `mh_voice_manual` (la voz, la misma que ya usaba `voiceAlert.js`) y `mh_voice_rate` (la velocidad) |
| Quien habla | `apps/web/heredado/lib/voiceAlert.js` | Usa la voz elegida si ESTE dispositivo la tiene y puede sonar; si no, cae a la selección de siempre. Recogida de la cafetería (`Recogida.tsx`) hace lo mismo |

Decisiones que conviene conocer:

- **La preferencia es del dispositivo, no del negocio.** Un iPhone, un Android y un monitor de cocina
  no tienen las mismas voces: la «Paulina» de uno no existe en el otro. No se escribe nada en la
  configuración compartida del negocio.
- **«Automática» es la opción por omisión** y es exactamente lo que sonaba antes: es-MX primero, luego
  es-419, es-US, es-ES; voces locales antes que las de la nube; las de calidad conocida suman puntos.
- **Orden de la lista:** México, luego Estados Unidos y el resto de América, al final España y lo
  demás; dentro de cada grupo, las que suenan sin internet van primero.
- **No se muestra lo que no puede sonar:** lo que no es español; las voces de la nube cuando no hay
  internet (`localService: false`); y una voz que acaba de fallar o no responde al escucharla (se quita
  hasta recargar, y si era la guardada, el dispositivo vuelve a la automática).
- **Velocidad y tono NO son voces.** La velocidad es un control aparte (0.7 a 1.3) que ajusta la voz
  elegida; el tono no se expone.
- Si la voz guardada era de la nube y se va el internet, los avisos usan la automática mientras tanto y
  la elegida vuelve sola con la conexión.

### Audio en el teléfono (iOS y Android)

Safari en iPhone/iPad y Chrome en Android no dejan sonar la voz hasta que la persona toca la pantalla:
el primer `speak()` tiene que ocurrir en la misma pila de llamadas que un toque.

- Por eso la primera reproducción sale SIEMPRE de un botón («Escuchar», «Probar voz») y
  `speakSample` es síncrona: no hay `await`, `setTimeout` ni `then` entre el toque y `speak()`.
- Un aviso que llega SIN toque previo (un pedido listo mientras nadie ha tocado la pantalla desde que
  se abrió la página) puede quedarse mudo en iOS. Es una limitación del navegador, ya documentada en
  `voiceAlert.js` («Activar audio»); `ConfiguracionDeVoz` no la cambia.
- iPhone: el interruptor lateral en silencio calla la voz; con la pantalla bloqueada o la pestaña en
  segundo plano el sistema pausa el audio.
- Android: las voces en la nube suelen necesitar internet; las que se descargan en Ajustes → Idioma →
  Texto a voz suenan sin conexión (comportamiento habitual del sistema; no se midió en un equipo).
- Algunos navegadores entregan la lista de voces vacía al abrir y la llenan después, y no todos avisan
  con `voiceschanged`: la pantalla vuelve a pedirla unas veces antes de rendirse y escucha el evento con
  `addEventListener` para no pisar el `onvoiceschanged` que ya usa `voiceAlert.js`.

**No verificado en dispositivos reales.** Las pruebas simulan `speechSynthesis`; lo que dicen es que la
selección, la caída y los errores se comportan como se describe. No se probó el sonido en un iPhone ni en
un Android; eso se comprueba abriendo Configuración en cada uno.

## 2 · Motores evaluados

Se leyeron las páginas y fichas de los cuatro enlaces el 20-10-2026 (GitHub, Hugging Face y PyPI). **No se
descargaron pesos, no se ejecutó nada y no se escuchó ninguna muestra**: no hay forma de oír audio desde
aquí. Todo juicio sobre qué tan natural suena queda pendiente de que alguien escuche.

### 2.1 · Chatterbox (Resemble AI)

| Pregunta | Respuesta |
| --- | --- |
| Versión | Paquete `chatterbox-tts` **0.1.7** en PyPI (26-03-2026). La familia vigente se llama «Multilingual V3»; el repositorio no tiene releases numerados |
| Licencia del código | **MIT** |
| Licencia de los pesos | Las fichas de Hugging Face de `ResembleAI/chatterbox` y de `Chatterbox-Multilingual-es-mx-latam` declaran `license: mit`. La ficha no describe los datos de entrenamiento: para uso comercial conviene que Miguel lo confirme con Resemble |
| Idiomas | El modelo general cubre 23 idiomas, español incluido. Hay un **paquete de un solo idioma para español de Latinoamérica** (`Chatterbox-Multilingual-es-mx-latam`, locale es-419 / es-MX, id `es`), afinado desde el modelo base (creado 22-04-2026, modificado 10-06-2026) |
| Tamaño | 500 M de parámetros el multilingüe. Pesos del paquete es-MX: `t3_es_mx_latam.safetensors` **2.14 GB** + `s3gen_v3.safetensors` **1.06 GB** (y tokenizador) ≈ **3.2 GB** en float32 |
| Requisitos | Python ≥ 3.10 (probado en 3.11). Dispositivos admitidos: `cuda`, `cpu`, `mps`. **No publican VRAM ni RAM.** El ejemplo de la ficha usa `device="cuda"` |
| Latencia esperada | **No hay cifra publicada para el multilingüe.** El «menos de 200 ms» del repositorio es del servicio alojado de Resemble, no del modelo abierto. La única medida del repositorio es de Nano (110 M, solo inglés): 3x tiempo real en 8 núcleos de CPU, y no aplica al español |
| ¿Vercel serverless? | **No.** Ver 2.5 |
| Muestras publicadas | Sí: página de demostración (`resemble-ai.github.io/chatterbox_demopage/`) y Spaces de Hugging Face, entre ellos `ResembleAI/Chatterbox-Multilingual-TTS-es-mx-latam`. **La ficha del paquete es-MX no trae audio.** No se escucharon |
| Otros | Todo el audio generado lleva la marca de agua inaudible PerTh (sobrevive a MP3 y edición); hay que saberlo, no impide usarlo. Admite clonación de voz con un audio de referencia |

### 2.2 · Chatterbox-Multilingual-es-mx-latam

Es el mismo motor del punto anterior con los pesos de español latino. Lo que cambia para la decisión:

- Es la única opción de las cuatro que **declara el acento que Morphiq necesita** (es-MX / es-419).
- La ficha dice que busca «un control de calidad más ajustado» para español latino que el modelo
  general. Es una afirmación de su autor; no se verificó.
- Sin limitaciones documentadas, sin datos de entrenamiento descritos y sin audio en la ficha. Tiene 5
  «me gusta» en Hugging Face: es un modelo joven y poco probado por terceros.

### 2.3 · MeloTTS (MyShell)

| Pregunta | Respuesta |
| --- | --- |
| Versión | `setup.py` dice **0.1.2**; sin releases en GitHub |
| Licencia del código | **MIT**, «libre para uso comercial y no comercial» según su README |
| Licencia de los pesos | `myshell-ai/MeloTTS-Spanish` declara `license: mit`. Tampoco describe los datos de entrenamiento |
| Requisitos | **CPU basta para tiempo real** (afirmación del autor, sin cifras). Probado en Python 3.9 y Ubuntu 20.04; instalación nativa en Linux y macOS, y **Docker para Windows**. Requiere `python -m unidic download` |
| Latencia esperada | Solo cualitativa («tiempo real en CPU»). **No hay cifra publicada.** Velocidad ajustable (`speed`) |
| ¿Vercel serverless? | **Quizá, pero no conviene.** Ver 2.5 |
| Muestras | Sí: un WAV en español en el README y en la ficha, más un Space no oficial (`mrfakename/MeloTTS`). No se escucharon |

### 2.4 · MeloTTS-Spanish

| Pregunta | Respuesta |
| --- | --- |
| Versión | Sin número; repositorio creado 29-02-2024 y **no se ha modificado desde el 01-03-2024** |
| Licencia | **MIT** (ficha) |
| Tamaño | `checkpoint.pth` **207.9 MB** (y un `config.json` de 3 KB). Es 15 veces menor que el paquete es-MX de Chatterbox |
| Voces y acento | **Un solo hablante, `ES`.** La ficha **no declara acento regional**: no se sabe si suena a México, a España o neutro. Es el punto débil para este mercado |
| Otros | La metadata de la ficha también etiqueta «ko» (coreano), probablemente un error de quien la publicó. Se basa en VITS / Bert-VITS2 |

### 2.5 · ¿Cabe en Vercel?

Límites de Vercel Functions con Fluid compute (<https://vercel.com/docs/functions/limitations>,
consultada el 20-10-2026): memoria máxima **4 GB / 2 vCPU** (Pro), **250 MB** de paquete sin comprimir
(500 MB en Python; hasta 5 GB con «large functions», en beta), 800 s de duración máxima (Pro), 4.5 MB de
carga útil. La tabla de límites **no ofrece GPU**.

- **Chatterbox:** no. Sus ≈ 3.2 GB de pesos exceden el paquete estándar y solo caben en la beta de 5 GB;
  y aun así se ejecutaría en 2 vCPU y 4 GB de RAM, sin la GPU que el ejemplo de la ficha da por hecha. Sin
  una cifra publicada de latencia en CPU, no se puede prometer que una frase corta tarde menos que
  un pedido en enfriarse.
- **MeloTTS-Spanish:** el modelo (208 MB) cabría en el paquete de 500 MB de Python, pero PyTorch, las
  dependencias de MeCab/UniDic y el modelo de lenguaje que usa Bert-VITS2 no se pudieron medir desde las
  fichas. **Sin verificar.** Aunque cupiera, cada arranque en frío cargaría un modelo neuronal completo en
  el camino de un aviso que debe ser inmediato.

Conclusión: **ninguno de los dos debe correr dentro de Vercel.** Vercel puede ser el que PIDA el audio,
no el que lo genere.

## 3 · Recomendación

**No cambiar la voz de producción todavía. Hacer una prueba de oído de un día y, según lo que se oiga,
montar un servicio de voz aparte.**

1. **Prueba de oído (esfuerzo: horas, riesgo: ninguno).** Generar en una máquina de Miguel 15 o 20
   frases reales —«Mesa cuatro, su orden está lista», «Nuevo pedido mesa 7: dos cafés americanos, sin
   azúcar», una con alergia— con **Chatterbox es-MX latam** y con **MeloTTS-Spanish**, y compararlas con
   la mejor voz del navegador en el teléfono de la cocina. La naturalidad y el acento NO se pueden
   decidir leyendo fichas.
2. **Si gana Chatterbox es-MX latam:** es la opción que mejor encaja con el acento, y necesita **un
   servidor propio con GPU** (la VRAM exacta no está publicada; hay que medirla en la prueba).
3. **Si gana MeloTTS-Spanish:** es la opción barata y de CPU, pero hay que averiguar primero qué acento
   tiene su voz `ES`, porque la ficha no lo dice.
4. **Si ninguna supera a la mejor voz del navegador:** quedarse con `speechSynthesis` y la pantalla de
   elección ya hecha. Es una salida válida, no un fracaso.

Lo que se recomienda **no** hacer: servir un motor neuronal desde una función de Vercel, ni prometerle a
un cliente «voz natural» antes de que alguien la haya oído en el local.

## 4 · Qué haría falta para integrarla (infraestructura)

| Pieza | Qué es | Nota |
| --- | --- | --- |
| Servicio de voz | Un contenedor Python con el motor elegido y un endpoint `POST /tts` (`texto`, `voz`, `velocidad`) que devuelve audio (WAV/Opus) | CPU para MeloTTS; **GPU** para Chatterbox. Fuera de Vercel (VM, contenedor o GPU bajo demanda). El costo no se estimó: depende del proveedor y se mide en la prueba |
| Quién lo llama | Una ruta del servidor de Morphiq (no el navegador), con un secreto compartido y límite por organización | Que el navegador no pueda gastar la GPU del cliente de al lado. Es el mismo patrón de `permitir(...)` de las demás rutas |
| Caché de audio | Guardar cada frase generada por hash de `(texto, voz, velocidad)` en Supabase Storage o Vercel Blob y servirla como archivo estático | Los avisos se repiten mucho («Mesa N, su orden está lista»); la mayoría se genera una sola vez. Es lo que vuelve viable la latencia |
| Generar antes, no cuando suena | Pedir el audio cuando el pedido se crea o pasa a «preparando», no cuando llega a «listo» | Un motor sin cifra de latencia no puede estar en el camino del aviso |
| Reproducción | `HTMLAudioElement` en el navegador, con la MISMA regla de gesto previo de la sección 1 (hay que seguir teniendo el botón «Activar audio») | Las políticas de reproducción automática de iOS y Android también aplican al audio normal; hay que probarlo en un equipo real |
| Respaldo | Mantener `speechSynthesis` como caída cuando el servicio no responda o no haya internet | El monitor de la cocina no puede quedarse mudo porque falló la red |
| Pantalla | Añadir a `ConfiguracionDeVoz` las voces de Morphiq como una fila más, junto a las del dispositivo | La preferencia seguiría siendo por dispositivo |
| Datos | El texto que se manda lleva números de mesa y, a veces, el nombre de quien espera su café | Va por TLS al servicio propio; no se manda a un tercero. Dicho ahora para que no sea una sorpresa después |

**Estado: sin integrar.** Ninguna de estas piezas existe todavía.

## 5 · Lo que queda sin saber

- Cómo suena cada motor (no se escuchó nada).
- La latencia real de Chatterbox multilingüe y de MeloTTS-Spanish en el hardware que se elija.
- La VRAM que pide Chatterbox es-MX.
- El acento de la voz `ES` de MeloTTS-Spanish.
- La procedencia de los datos de entrenamiento de ambos, relevante si Miguel quiere vender el sistema
  con «voz propia» a clientes.
- El sonido real de la pantalla de elección en iPhone y Android.

### Fuentes

- <https://github.com/resemble-ai/chatterbox>
- <https://pypi.org/project/chatterbox-tts/>
- <https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-mx-latam>
- <https://huggingface.co/api/models/ResembleAI/Chatterbox-Multilingual-es-mx-latam> (archivos y tamaños)
- <https://github.com/myshell-ai/MeloTTS> y su `docs/install.md` y `setup.py`
- <https://huggingface.co/myshell-ai/MeloTTS-Spanish> y su API (archivos y fechas)
- <https://vercel.com/docs/functions/limitations>
