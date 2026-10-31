"""Build Labby into one self-contained HTML page: dist/labby.html."""
import pathlib, re, sys
root = pathlib.Path(__file__).parent
tpl = (root / 'src/index.template.html').read_text()
css = (root / 'src/styles.css').read_text()
js = '\n'.join(p.read_text() for p in sorted((root / 'src/js').glob('*.js')))
for bad in ('</script', '<!--'):
    if bad in js.lower():
        sys.exit(f'Refusing to build: script contains {bad!r}')
out = tpl.replace('/*STYLES*/', css).replace('/*SCRIPTS*/', js)
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/labby.html').write_text(out)
print(f'dist/labby.html  {len(out)/1024:.0f} KB')
