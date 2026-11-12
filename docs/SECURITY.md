# Segurança

## Princípios
- Menor privilégio por usuário, agente, ferramenta e ambiente.
- Segredos somente no backend ou cofre seguro local; nunca no bundle frontend.
- Aprovação explícita para ações destrutivas, financeiras ou externas.
- Isolamento de browser, terminal e filesystem.
- Auditoria de chamadas de ferramenta e mudanças de configuração.

## Requisitos antes de produção
- Substituir todas as senhas de desenvolvimento.
- Configurar TLS e gestão de segredos.
- Implementar criptografia de credenciais em repouso.
- Aplicar quotas por usuário/agente.
- Bloquear acesso a metadata endpoints e redes privadas a partir do browser tool.
- Validar arquivos enviados e limitar tamanho/tipo.
- Criar política de retenção e exclusão de dados.
- Testar restauração de backups.

## Token do sistema no desktop (2026-11-12)

**Problema anterior:** o desktop lia `VITE_API_TOKEN` no build. Como o Vite embute toda variável com prefixo `VITE_` no JavaScript, o token do sistema (`API_TOKEN`, que age como administrador) ia para o bundle e para `apps/desktop/dist/`.

**O que foi feito:**
- `VITE_API_TOKEN` foi removido do frontend. `vite build` não contém mais o nome da variável nem o valor do token (verificado no `dist/` gerado).
- Em produção o desktop não tem token do sistema: só vale a sessão de login da pessoa.
- Em desenvolvimento (`vite` / `tauri dev`), o valor fica em `GJ_DEV_API_TOKEN` no `apps/desktop/.env.local` (sem prefixo `VITE_`, portanto fora do bundle). O servidor do Vite entrega o token em `/__gj/dev-token` só em dev, e só para requisições de mesma origem (`Sec-Fetch-Site: same-origin`). Qualquer outra origem recebe 404. Está em `apps/desktop/vite.config.ts`.
- `.env.example` e `docs/PLANO_CONTINUIDADE.md` passaram a usar `GJ_DEV_API_TOKEN`.

**Ainda falta (não feito nesta etapa):**
1. **Entrega pelo Tauri/Rust em produção.** A versão ideal guarda o token de sistema (ou a sessão) no cofre do sistema operacional e o entrega por um comando Rust. Não foi feito porque o lado Rust não pôde ser compilado nesta sessão. O toolchain existe em `tools/rust`, mas fora do PATH, e `tauri build` não foi rodado.
2. **Login obrigatório em produção.** Sem provedor de login configurado, o app de produção não autentica ninguém. É preciso configurar um provedor (OIDC/Google) antes de distribuir.
3. **Rotação do `API_TOKEN`.** O `dist/` gerado antes desta mudança continha o token. Ele foi substituído pelo build atual, mas o valor esteve em um bundle local. Recomenda-se trocar o `API_TOKEN` no backend e no `GJ_DEV_API_TOKEN` local. Decisão do responsável.
4. **Sessão no `localStorage`.** O token de cada pessoa fica no `localStorage` da janela, legível por qualquer JavaScript do app. Migrar para armazenamento seguro via Rust faz parte do item 1.
5. **Endpoint de dev.** Qualquer processo local pode forjar `Sec-Fetch-Site`, então o endpoint protege só contra páginas de navegador. Risco aceitável apenas em dev; some do build de produção.

## Aviso
O Docker Compose deste repositório é para desenvolvimento local. Não publique os serviços diretamente na internet sem autenticação, firewall, TLS e hardening.
