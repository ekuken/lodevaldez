# Sistema de Café — proyecto para Visual Studio Code

Sistema de gestión para cafeterías: plano del salón con colores por estado,
punto de venta, pedidos, caja, cuentas corrientes, productos con stock,
proveedores y usuarios. Corre en el navegador, sin instalar nada ni internet.

## Archivos

    index.html      estructura de la página (menú lateral y secciones)
    estilos.css     todos los estilos
    js/
      01-nucleo.js          datos, guardado, usuarios, permisos y cálculos
      02-ingreso.js         pantalla de ingreso con PIN y ABM de usuarios
      03-salon-y-venta.js   plano del salón, mesas y punto de venta
      04-pedidos.js         historial con filtros y exportación
      05-caja.js            caja diaria, gastos, cierre e impresiones
      06-productos.js       carta y control de stock
      07-proveedores.js     proveedores y compras
      08-cuentas.js         cuentas corrientes
      09-ajustes.js         configuración, respaldos y ayuda
      10-inicio.js          arranque del sistema y sesión
    construir.py    junta todo en un único "Sistema Cafe.html"

## Cómo trabajarlo

1. En VS Code: **Archivo → Abrir carpeta…** y elegí esta carpeta.
2. Para verlo funcionando, abrí `index.html` en el navegador: clic derecho sobre
   el archivo → **Revelar en el Explorador de archivos** y doble clic. O instalá
   la extensión **Live Server** (Ritwick Dey) y usá clic derecho →
   **Open with Live Server**, que recarga sola la página al guardar.
3. Cuando quieras el archivo único para llevar al café, en la terminal:

       python construir.py

   Eso genera `Sistema Cafe.html`, que funciona solo, sin el resto de la carpeta.

⚠️ **Ojo con los datos.** El sistema guarda todo en el navegador y lo hace *por
dirección*: `file:///...` y `http://127.0.0.1:5500` son dos lugares distintos.
Si cargás pedidos en uno y abrís el otro, va a parecer que se borró todo. Elegí
una sola forma de abrirlo. Para pasar datos de una a otra usá
**Ajustes → Descargar respaldo** y después **Restaurar respaldo**.

## Para depurar

F12 en el navegador abre la consola. Ahí podés escribir `S` para ver todo el
estado del sistema, `S.pedidos` para los pedidos o `S.config` para la
configuración. Los errores de JavaScript aparecen en la pestaña Console.

## Primeros pasos

Entrá con el usuario **Encargado**, clave **1234** (el otro es **Mozo 1**, clave
**1111**). Cambiá esas claves en Ajustes antes de usarlo en serio, cargá los
datos del negocio, acomodá el plano en Mesas → Editar plano y reemplazá los
productos de ejemplo por tu carta real.

No emite factura fiscal ni se conecta con AFIP: los comprobantes dicen
"documento no válido como factura".
