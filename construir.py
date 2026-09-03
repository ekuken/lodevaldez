#!/usr/bin/env python3
"""
Junta index.html + estilos.css + js/*.js en un solo archivo HTML.

Uso:  python construir.py

Genera "Sistema Cafe.html" en esta misma carpeta: es el que se copia a la
computadora del café y se abre con doble clic, sin necesitar los demás archivos.
"""

from pathlib import Path
import re
import sys

BASE = Path(__file__).parent
SALIDA = BASE / 'Sistema Cafe.html'


def main():
    html = (BASE / 'index.html').read_text(encoding='utf-8')
    css = (BASE / 'estilos.css').read_text(encoding='utf-8')

    html = re.sub(r'\s*<link rel="stylesheet" href="estilos\.css">',
                  '\n<style>\n' + css.strip() + '\n</style>', html)

    def meter_js(m):
        src = m.group(1)
        # Los scripts de internet (la librería de la nube) se dejan como están
        if src.startswith('http://') or src.startswith('https://'):
            return m.group(0)
        ruta = BASE / src
        if not ruta.exists():
            print('  ! No encuentro', ruta)
            sys.exit(1)
        return '<script>\n' + ruta.read_text(encoding='utf-8').strip() + '\n</script>'

    html = re.sub(r'<script src="([^"]+)"></script>', meter_js, html)

    SALIDA.write_text(html, encoding='utf-8')
    print('OK -> "%s"  (%.0f KB)' % (SALIDA.name, SALIDA.stat().st_size / 1024))


if __name__ == '__main__':
    main()
