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

Ojo con lo que se guarda: el catálogo y la sesión van a `localStorage` **ya
procesados**, así que cambiar cómo se derivan no basta — las copias viejas
seguirían pintándose hasta caducar. Por eso llevan una `DATA_VERSION` que las
invalida, y además se vuelven a pasar por el acortador **al leerlas**: la
versión sola no protege si el navegador arrastra un `app.js` anterior desde su
propia caché. Las preferencias (me gusta, historial, volumen) no llevan
versión y sobreviven a los cambios.

**▶ En vivo: <https://julioalbertoo.github.io/gilafy/>**

Sin dependencias, sin build, sin claves de API: son ficheros estáticos. Abre
`index.html` desde cualquier servidor web y funciona.

---

## Por qué este catálogo

King Gizzard mantiene un programa oficial de *bootlegger*: la banda autoriza
expresamente grabar sus conciertos y redistribuirlos sin ánimo de lucro, y esas
grabaciones viven en Internet Archive. Es material genuinamente libre, así que
Gilafy lo consulta y lo reproduce directamente desde allí.

De estudio hay exactamente uno: **Polygondwanaland** (2017), que la banda
publicó con los másters y la portada descargables y permiso expreso para
copiarlo, prensarlo y venderlo — *«We do not own this record. You do»*.
Decenas de sellos lo prensaron. Entra por derecho propio, marcado como
`Estudio`, y sale de una búsqueda dirigida por título: de las varias subidas
que suele haber en el archivo se conserva la más descargada.

El resto del catálogo de estudio es comercial y **no** está aquí: no se busca
ni se enlaza, aunque haya subidas de terceros en el archivo. Añadir un disco
liberado nuevo es una línea en `FREE_STUDIO`.

Todo el audio se transmite desde `archive.org`; este repositorio no contiene ni
un solo byte de música.

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
| base | Una columna, cabecera con el buscador fijo arriba, reproductor compacto con el progreso como línea fina, rejilla de 2 columnas |
| 576px | La rejilla pasa a fluir (`auto-fill`), el carril crece |
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

Dos medidas no son negociables en el teléfono, y las dos son de Safari iOS:

- **El campo de búsqueda mide 16px.** Por debajo de esa cifra, Safari amplía la
  página al enfocarlo —para leer el campo a 16px— y no la reduce al salir. Con
  ese 114 % el viewport de maquetación deja de caber en la pantalla y la
  interfaz se desborda por la derecha. Los 14px del diseño vuelven bajo
  `@media (pointer: fine)`, donde ese zoom no existe.
- **La zona segura de abajo se suma, no se descuenta.** `--safe-b` vive dentro
  de `--player-h`, que es lo que queda pegado al borde, así que el reproductor
  crece con el indicador de inicio en vez de comerle sitio a los controles, y
  todo lo que se apila encima —cola, aviso y el alto de `.app`— se aparta solo.

[design]: https://getdesign.md/spotify/design-md

## Estructura de la interfaz

La app abre directamente en **Publicaciones**, sin portada intermedia y sin
menú inferior:

1. **Filtros por tipo** en una fila que se desplaza en horizontal: *Todo*,
   *Álbumes*, *Directos*, *Sencillos y EP*. Sólo aparece el filtro de un tipo
   que tenga algo detrás.
2. **Última publicación**, la más reciente de lo que el filtro deje a la vista.
3. **Una sección por tipo**, en filas de carátula + título + «Tipo · Año». Con
   *Todo* se muestran doce por sección y un *Mostrar todo* que salta al filtro;
   ya filtrado, sesenta.
4. **Escuchado recientemente**, al final, como carril horizontal con anclaje
   (`scroll-snap`), igual que los carruseles de la app original.

El tipo sale del propio catálogo: `studio` lo marca `FREE_STUDIO`, y del resto
se deduce por el título, que es lo único que devuelve el buscador del archivo
—la inmensa mayoría son conciertos completos, y sólo unas pocas subidas se
anuncian como EP o sencillo. Se vuelve a deducir **al leer** la copia guardada,
por el mismo motivo que la abreviatura del nombre.

**El buscador vive fijo justo debajo de la cabecera.** No necesita
`position: sticky`: vive fuera de `#view`, que es el único elemento que se
desplaza, así que se queda quieto por construcción. Es la navegación
permanente que queda en el teléfono —ya no hay barra de pestañas—, junto al
chevrón de atrás y el atajo a la biblioteca de la cabecera; en escritorio la
barra lateral sigue haciendo de navegación principal.

## Funcionalidad

- Publicaciones filtrables por tipo, con la última destacada y el historial en carril
- Búsqueda instantánea por ciudad, sala, año o título
- Vista de grabación con lista de temas, duraciones y descripción
- Cola de reproducción, saltando a cualquier pista con un clic
- Aleatorio (Fisher-Yates, conservando la pista actual) y repetición off/all/one
- Me gusta, historial y volumen persistentes en `localStorage`
- La sesión se restaura al recargar: misma cola, misma pista, mismo segundo
- Estados de carga (*skeletons*), de error y de vacío
- Mobile first, de 320 px a escritorio, con el buscador fijo bajo la cabecera
- Pantalla completa de reproducción al pulsar la barra inferior (ver abajo)
- Service worker que cachea sólo el *app shell*, y con la red por delante:
  nunca el audio, para no romper las peticiones `Range` que necesita el
  desplazamiento dentro del tema, y nunca por delante de la red, para no
  servir siempre la versión del despliegue anterior
- La app se recarga sola cuando llega una versión nueva — salvo si hay algo
  sonando, que entonces espera a la siguiente visita

### Pantalla completa de reproducción

En el teléfono, pulsar la barra inferior la maximiza, como en la app original:
carátula grande, tiempo restante en negativo y controles completos. Se cierra
con el chevrón, con `Escape`, con el botón atrás del sistema o arrastrando
hacia abajo.

No duplica lógica. Los dos conjuntos de controles declaran `data-ctrl="…"` y
un único manejador los ata a todos; cada dato que se pinta lleva una clase
`.js-*` y se escribe sobre todos los elementos que la declaran. Por eso el
aleatorio, el corazón o la barra de progreso quedan sincronizados en ambos
sentidos sin código de sincronización.

Detalles que costaron un intento cada uno:

- Abrir añade una entrada al historial, de modo que el botón atrás cierra la
  hoja en lugar de cambiar de vista. Al cerrar por cualquier otra vía se
  deshace esa entrada, para no dejar basura navegable.
- La carátula se dimensiona con unidades de contenedor (`min(100cqw, 100cqh)`).
  `aspect-ratio` sólo deriva el eje que no se declara: con sólo `max-width` y
  `max-height` la imagen sale a su tamaño intrínseco —las miniaturas del
  archivo son diminutas— y con una altura del 100% se deforma cuando el hueco
  es más estrecho que alto.
- Arrastrar una imagen dispara el drag-and-drop nativo del navegador, que se
  come los `pointermove`/`pointerup` y deja el gesto colgado. Hace falta
  `draggable="false"`, cancelar `dragstart` y capturar el puntero.
- La hoja lleva `min-width: 0`. Es un elemento flexible, y con el `auto` por
  defecto crece hasta el ancho de su contenido más largo —el nombre de la
  grabación, que va en una sola línea— en vez de obligarlo a recortarse. Con
  los títulos reales del archivo, que son largos, la hoja se salía por la
  derecha y el `overflow: hidden` del contenedor cortaba el corazón, la
  repetición y el tiempo restante.

En escritorio no existe: la barra ya muestra todos los controles.

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
| `Esc` | Cerrar la pantalla completa |

## Despliegue

`.github/workflows/pages.yml` publica la app en GitHub Pages en cada push a
`main`. Ya está activo: <https://julioalbertoo.github.io/gilafy/>.

Si alguna vez hay que rehacerlo en otro repositorio, el `GITHUB_TOKEN` de
Actions no puede crear el sitio por sí mismo, así que la primera vez toca
activarlo a mano en **Ajustes → Pages → Source: _GitHub Actions_** (y, si
Actions está en sólo lectura, en **Ajustes → Actions → General → Workflow
permissions: _Read and write permissions_**).

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
87 escenarios: publicaciones y sus filtros, reproducción, avance automático,
continuidad con la pestaña oculta, metadatos de Media Session, cola,
persistencia, búsqueda, estado de error, pantalla completa, el carril
horizontal del historial y la abreviatura del nombre.

La parte responsive recorre seis anchos (320 · 390 · 576 · 768 · 896 · 1440) y
en cada uno comprueba en ambos sentidos qué debe verse y qué no: la barra
lateral sólo desde 768 px, el buscador fuera de la zona que se desplaza, el
reproductor pegado al borde inferior, exactamente un botón de reproducción, el
estado del carril de iconos y que no haya desbordamiento horizontal.

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
