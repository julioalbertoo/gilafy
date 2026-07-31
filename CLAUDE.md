# Notas para Claude

## Git

**Cada arreglo va a `main`.** Terminar un arreglo incluye empujarlo a `main`, no
sólo a la rama de trabajo. Si se ha desarrollado en una rama, se fusiona y se
empuja `main` en la misma tanda; no hay que esperar a que lo pidan.

Ojo con lo que eso implica: `.github/workflows/pages.yml` despliega a GitHub
Pages en cada push a `main`, así que empujar publica. Las comprobaciones
(`node test/e2e.js`) se pasan **antes** de empujar, no después.
