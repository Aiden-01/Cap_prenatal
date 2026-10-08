# CPREN-70 — Iconos e instalación web

## Diagnóstico y decisión

El HTML solo declaraba `/favicon.svg`: SVG de cruz blanca sobre fondo azul
`#1d6fa4`, viewBox 32×32. No había manifest, iconos PNG de instalación,
favicon ICO ni Apple Touch. `public/icons.svg` es un sprite y no un icono de
instalación. El identificador móvil del login es `ClipboardList` de Lucide,
un componente visual distinto; no demuestra que exista un icono instalable.

La ausencia de manifest/iconos de instalación deja a Edge sin la identidad
declarada para Windows y es consistente con el fallback de letra informado.
No se reprodujo la instalación original en Edge/Opera GX; un acceso directo
de URL puede conservar el icono de Opera según el mecanismo utilizado. No se
garantiza que todo acceso directo de Windows adopte el favicon.

El usuario autorizó reutilizar el favicon actual. Se mantuvo su SVG intacto
y se rasterizó directamente, sin crear un nuevo logo, mediante resvg.
Pillow empaquetó las resoluciones ICO. Herramientas temporales en `tmp_cpren70/`
(ignorado), sin nuevas dependencias de la aplicación ni cambios de lockfile.

## Archivos

- `frontend/index.html`: enlaces ICO/PNG/SVG, Apple Touch, manifest y theme-color.
- `frontend/public/manifest.webmanifest`: identidad, `id`, `start_url` y `scope`
  `/`, display standalone, idioma español, colores y PNG any/maskable.
- `frontend/public/favicon.ico`: 16, 32, 48 y 256 px.
- `frontend/public/icons/favicon-32.png`: 32×32.
- `frontend/public/icons/apple-touch-icon.png`: 180×180.
- `frontend/public/icons/icon-192.png`: 192×192, purpose any.
- `frontend/public/icons/icon-512.png`: 512×512, purpose any.
- `frontend/public/icons/icon-maskable-512.png`: 512×512, fondo opaco; marca
  original al 75% y centrada para mantener la cruz dentro de la zona segura.
- Este documento.

No se modificaron React, router, autenticación, módulos clínicos, backend ni
configuración Vite. No se añadió service worker, caché offline ni permisos.
El arranque en `/` conserva la decisión actual de autenticación/redirección.
Vite copia los archivos de public a la raíz del build.

## Validaciones locales ejecutadas, 2026-10-08

- PNG decodificados y verificados mediante Pillow: dimensiones/formato correctos.
  ICO contiene las cuatro dimensiones declaradas; imágenes any/maskable
  inspeccionadas visualmente.
- `npm test`: 187 pruebas Node pasan; Vitest 15 archivos / 126 pruebas pasan;
  cero fallos/omitidas en ejecución final.
- Primera ejecución Vitest en sandbox: 10 archivos fallaron con ENOENT de módulos
  temporales. Repetición fuera del sandbox: todos pasan. No se cambió código
  para ocultar ese fallo de entorno.
- `npm run lint`: exit 0.
- `npm run build`: exit 0, 1918 módulos, 13.42 s. Avisos: Browserslist con base
  antigua y diagnóstico de tiempos de plugins; sin actualizar dependencias.
- Preview Vite del build: 11 GET locales pasan. Manifest HTTP 200, JSON/MIME
  correctos; tres PNG de manifest con MIME/dimensiones y bytes idénticos al
  origen; cuatro recursos favicon/Apple Touch HTTP 200 con MIME image;
  `/`, `/login` y `/pacientes/synthetic` sirven el HTML SPA con manifest.
  Esto verifica fallback del servidor local, no login real ni instalación Windows.
- Primer intento HTTP restringido: EACCES; intento desde fuera hacia preview
  aislado: timeout. Preview y verificador fuera del sandbox: todos pasan.
- Sin despliegue ni instalación real Edge/Opera GX/móvil en esta sesión.

## Comprobar en Edge después de desplegar

1. En `edge://apps`, desinstalar la instalación antigua de CAP Prenatal. Si se
   ofrece borrar datos del sitio, dejar esa opción desmarcada para conservarlos.
   Quitar anclajes antiguos que sigan apuntando a esa instalación.
2. Abrir el sitio ya actualizado y recargar con Ctrl+F5. En DevTools,
   Application → Manifest, comprobar nombre, iconos y ausencia de errores;
   en Network comprobar manifest/PNG HTTP 200 y formatos correctos.
3. Usar el menú de Edge para instalar el sitio como aplicación (el rótulo puede
   variar por versión). Comprobar el icono de cruz azul en la confirmación y
   después en Inicio, escritorio y barra de tareas; volver a anclar la app nueva.
4. Comprobar inicio de sesión y apertura de rutas habituales. La app continúa
   requiriendo conexión; no se implementó offline.

En móviles, agregar nuevamente a pantalla de inicio para comprobar PNG/maskable
o Apple Touch. En Opera GX, distinguir un acceso directo de URL de una aplicación
instalada: Windows puede usar el icono del navegador para el primero. La
configuración web aporta favicon/ICO, pero no fuerza el icono de un acceso
directo creado por el sistema operativo.

Referencias: [Microsoft: iconos Windows y manifest](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/icon-theme-color),
[MDN: iconos y propósito maskable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons).

Pendiente: revisión del diff, commit/push autorizados y despliegue posterior;
reinstalación real en Edge/Opera GX y dispositivos móviles. Jira: En revisión.
