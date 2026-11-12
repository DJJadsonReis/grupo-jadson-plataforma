# Avisos de terceiros

Este arquivo lista componentes de terceiros usados ou tomados como referência no Grupo Jadson, com seus avisos de direitos autorais e licenças, conforme exigido por suas licenças.

## OpenBot (CopilotKit)

- **Uso:** referência externa local, em `OpenBot/` (fora do versionamento Git desde o commit `6a0d776`). Serviu de base para padrões de layout e arquitetura, não é parte do código distribuído pelo Grupo Jadson. Qualquer trecho copiado deve manter este aviso.
- **Autor:** CopilotKit
- **Licença:** MIT
- **Origem:** arquivo `OpenBot/LICENSE` (cópia integral abaixo)

```
MIT License

Copyright (c) 2026 CopilotKit

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Demais dependências

As dependências diretas e transitivas (React, Vite, NestJS, Tauri, Vitest, entre outras) mantêm seus próprios autores e licenças, declaradas nos respectivos pacotes em `node_modules`. O inventário completo deve ser gerado a partir do `pnpm-lock.yaml` antes de distribuir binários (ver `CREDITS.md`).
