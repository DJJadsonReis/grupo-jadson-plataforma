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

## Aviso
O Docker Compose deste repositório é para desenvolvimento local. Não publique os serviços diretamente na internet sem autenticação, firewall, TLS e hardening.
