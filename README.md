# Gilafy

Una réplica de la interfaz de Spotify que reproduce **el material público de
KGLW** (King Gizzard & The Lizard Wizard), servido en directo desde Internet
Archive.

En la interfaz el nombre aparece siempre abreviado: el completo provoca saltos
de línea en la barra de reproducción, en las filas de temas y en la cabecera,
sobre todo en el teléfono. `app.js` normaliza todas las variantes que usa el
archivo (`King Gizzard & The Lizard Wizard`, `…and the…`,
`KingGizzardAndTheLizardWizard`, `King Gizzard` a secas) a `KGLW` al pintar,
y conserva el nombre completo sólo en las consultas, que es donde tiene que
coincidir literalmente.

**▶ En vivo: <https://julioalbertoo.github.io/gilafy/>**
(requiere activar Pages una vez — ver [Despliegue](#despliegue))

Sin dependencias, sin build, sin claves de API: son ficheros estáticos. Abre
`index.html` desde cualquier servidor web y funciona.

---

## Por qué este catálogo

King Gizzard mantiene un programa oficial de *bootlegger*: la banda autoriza
expresamente grabar sus conciertos y redistribuirlos sin ánimo de lucro, y esas
grabaciones viven en Internet Archive. Es material genuinamente libre, así que
Gilafy lo consulta y lo reproduce directamente desde allí.

Los álbumes de estudio comerciales **no** están aquí — no son de dominio
público y la app no los busca ni los aloja. Todo el audio se transmite desde
`archive.org`; este repositorio no contiene ni un solo byte de música.

El identificador exacto de la colección ha cambiado alguna vez, así que
`app.js` prueba varias consultas en orden (colección, luego `creator`, luego
texto libre) y se queda con la primera que devuelva resultados, recordándola en
`localStorage` para las siguientes visitas.

## Reproducción en segundo plano

Es el requisito central, y descansa en cuatro decisiones:

1. **Un único `<audio>` en el documento**, declarado en `index.html` y jamás
   destruido. Cambiar de vista sólo reescribe `#view`; el elemento que suena
   nunca se toca, así que navegar no interrumpe la música.
2. **Media Session API** (`app.js` → `updateMediaSession`): publica título,
   artista, álbum y carátula, y registra manejadores de `play`, `pause`,
   `previoustrack`, `nexttrack`, `stop`, `seekbackward`, `seekforward` y
   `seekto`. Resultado: controles reales en la pantalla de bloqueo de
   Android/iOS, en el centro de control de macOS y en los botones multimedia
   del teclado. `setPositionState` mantiene sincronizada la barra del sistema.
3. **Nada de pausar en `visibilitychange`.** El manejador sólo guarda la
   posición; ocultar la pestaña no detiene el audio.
4. **Progreso por evento `timeupdate`**, no por `requestAnimationFrame` — los
   navegadores congelan rAF en pestañas ocultas, y el reloj se quedaría atrás.

Se evita a propósito la Web Audio API: enrutar el audio por un `AudioContext`
hace que iOS suspenda la reproducción al bloquear la pantalla. Un `<audio>`
plano es lo que sobrevive en segundo plano.

El `manifest.json` permite instalarla como PWA (`display: standalone`), que es
donde el segundo plano se comporta mejor en móvil.

## Estilos

`styles.css` está escrito **mobile first**: la base sin ninguna consulta de
medios es el teléfono, y todo lo que crece se añade con `min-width`. Nada se
declara para escritorio y luego se deshace hacia abajo.

| Desde | Qué añade |
|---|---|
| base | Una columna, barra de pestañas inferior, reproductor compacto con el progreso como línea fina, rejilla de 2 columnas |
| 576px | La rejilla pasa a fluir (`auto-fill`) |
| 768px | Barra lateral como carril de iconos, controles completos del reproductor, cabecera de columnas en la lista de temas, héroe en fila, `:hover` en las tarjetas |
| 896px | La barra lateral se despliega con etiquetas |
| 1024px | La cola deja de flotar y ocupa su propia columna |
| 1280px | Más aire en la rejilla |

Los tokens salen de la especificación [DESIGN.md de Spotify][design], aplicada
literalmente:

| Rol | Valor |
|---|---|
| Fondo base | `#121212` |
| Superficies | `#181818` · `#1f1f1f` · `#252525` |
| Acento (sólo funcional) | `#1ed760` |
| Texto | `#ffffff` / `#b3b3b3` |
| Botones | píldora `9999px` / `500px`, circulares al 50 % |
| Etiquetas de botón | mayúsculas, *tracking* 1.4 px |
| Sombras | `rgba(0,0,0,.5) 0 8px 24px` y `rgba(0,0,0,.3) 0 8px 8px` |
| Escala de espaciado | base 8 px |

El verde nunca es decorativo: sólo aparece en reproducir, activo y CTA. El
color de las cabeceras se extrae de la carátula real mediante `<canvas>`, con
reserva a un tono derivado del identificador si el lienzo se contamina.

La tipografía propietaria de Spotify (SpotifyMixUI / CircularSp) no es
distribuible, así que se declara primero y se cae a la misma pila de reserva
que usa la app original.

[design]: https://getdesign.md/spotify/design-md

## Funcionalidad

- Portada con novedades, más escuchados, mejor valorados e historial
- Búsqueda instantánea por ciudad, sala, año o título
- Vista de grabación con lista de temas, duraciones y descripción
- Cola de reproducción, saltando a cualquier pista con un clic
- Aleatorio (Fisher-Yates, conservando la pista actual) y repetición off/all/one
- Me gusta, historial y volumen persistentes en `localStorage`
- La sesión se restaura al recargar: misma cola, misma pista, mismo segundo
- Estados de carga (*skeletons*), de error y de vacío
- Mobile first, de 320 px a escritorio, con barra de pestañas en el teléfono
- Service worker que cachea sólo el *app shell* — nunca el audio, para no
  romper las peticiones `Range` que necesita el desplazamiento dentro del tema

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `Espacio` | Reproducir / pausar |
| `←` `→` | Retroceder / avanzar 10 s |
| `Shift` + `←` `→` | Pista anterior / siguiente |
| `↑` `↓` | Volumen |
| `M` | Silenciar |
| `S` / `R` | Aleatorio / repetición |
| `/` | Enfocar la búsqueda |

## Despliegue

`.github/workflows/pages.yml` publica la app en GitHub Pages en cada push a
`main`. Hace falta activarlo **una sola vez**, porque el `GITHUB_TOKEN` de
Actions no tiene permiso para crear el sitio por sí mismo:

1. **Ajustes → Pages → Build and deployment → Source: _GitHub Actions_**
2. Si Actions está en sólo lectura, **Ajustes → Actions → General → Workflow
   permissions: _Read and write permissions_**
3. Vuelve a lanzar el workflow (pestaña Actions → *Re-run all jobs*), o
   simplemente haz otro push.

A partir de ahí queda en <https://julioalbertoo.github.io/gilafy/>.

## Ejecutar en local

Hace falta un servidor: `file://` bloquea el service worker y algunas
peticiones. Cualquiera sirve.

```bash
npx serve .
# o
python3 -m http.server 8000
```

Y abre `http://localhost:8000`.

## Comprobaciones

`test/e2e.js` levanta la app en un Chromium sin cabeza, simula las respuestas
de archive.org (búsqueda, metadatos, carátulas y un WAV sintético) y verifica
52 escenarios: reproducción, avance automático, continuidad con la pestaña
oculta, metadatos de Media Session, cola, persistencia, búsqueda, estado de
error y abreviatura del nombre.

La parte responsive recorre seis anchos (320 · 390 · 576 · 768 · 896 · 1440) y
en cada uno comprueba en ambos sentidos qué debe verse y qué no: exactamente
una navegación (lateral **o** pestañas, nunca las dos ni ninguna), exactamente
un botón de reproducción, el estado del carril de iconos y que no haya
desbordamiento horizontal.

```bash
npm i -D playwright && npx playwright install chromium
node test/e2e.js
```

## Estructura

```
index.html   Estructura y el <audio> persistente
styles.css   Sistema visual (tokens de DESIGN.md)
app.js       Datos, enrutado, vistas y motor de reproducción
sw.js        Cache del app shell (excluye archive.org)
manifest.json + icon*.svg   Instalación como PWA
test/e2e.js  Comprobaciones de extremo a extremo
.github/workflows/pages.yml   Despliegue a GitHub Pages en cada push a main
```

## Aviso

Proyecto no comercial y sin afiliación con Spotify AB ni con la banda. La
interfaz es un ejercicio de reproducción de un sistema de diseño; los nombres y
marcas pertenecen a sus titulares. El audio es propiedad de sus autores y se
reproduce bajo los términos con los que la banda lo puso a disposición del
público.
