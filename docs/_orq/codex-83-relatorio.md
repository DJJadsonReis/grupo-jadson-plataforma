# Relatório da tarefa 83

## O que foi feito

Corrigi o bloco de status e a fila autorizada no topo de `docs/FALTA_OPENBOT.md`, alinhei as linhas de escalonamento, exclusão de conversa, disponibilidade de modelo e ditado, corrigi os acentos no trecho mapeado e recalculei a contagem da tabela. Registrei a causa observada na sessão: `setup.json` estava ausente, então a reprodução autenticada no exe do dono continua pendente. Não afirmei que a reprodução local passou.

Em relação ao relatório 82, corrigi a classificação do escalonamento para Feito; acrescentei a evidência de exclusão definitiva (76–78); atualizei a evidência de disponibilidade de modelo (79); mantive o ditado como Parcial e explicitei a reprodução pendente; removi mascaramento e medição da lista de itens Feitos e os coloquei na fila como itens 8 e 9; e corrigi ordem, acentos e contagem.

## Arquivos incluídos

- `docs/FALTA_OPENBOT.md`
- `docs/_orq/codex-82-relatorio.md` (relatório já estava staged antes desta tarefa; incluído conforme instrução)
- `docs/_orq/codex-83-relatorio.md`

Nenhum código, `.env`, teste, `decisoes.md`, `status.md`, `build.rs`, `Cargo.lock` ou outro arquivo sujo foi incluído intencionalmente.

## Verificações e resultados reais

- `Test-Path` nos caminhos de código listados para exclusão (serviço, controller, teste PG, helper do desktop e `App.tsx`), disponibilidade (serviço e teste) e escalonamento (serviço e teste): `True` para os nove caminhos.
- `rg -n 'Escalonamento para pessoa|Exclusão|disponibilidade' docs/FALTA_OPENBOT.md`: encontrou as linhas 79, 91 e 170 marcadas Feito, além das evidências no bloco superior; exit 0.
- `rg -n 'Ditado por voz \(entrada\)' docs/FALTA_OPENBOT.md`: três ocorrências. Bloco superior diz Parcial, tabela na linha 96 diz Parcial; a ocorrência restante é histórico anterior; exit 0.
- Busca nas linhas da tabela por `Feito` junto de `mascar` ou `medi`: 0 resultados.
- Busca no topo até `### Bots e agentes` por `Decis?o`, `opera??o` ou `?o `: 0 resultados.
- Contagem das linhas de tabela (status extraído da 3ª coluna): total 66; Feito 40; Parcial 10; Falta 4; CORTADO 10; Mapeado, não autorizado 1; Autorizado / na fila 1. Soma: 66.
- `git diff --check`: exit 0 (Git emitiu apenas o aviso de conversão LF para CRLF no próximo toque).
- `git diff --cached --check`: exit 0 (mesmo aviso de fim de linha).
- Busca no diff por `sk-`, `tvly-`, `ntn_` ou sequência hexadecimal de 32+ caracteres: 0 correspondências; exit 0.
- Testes e typecheck: não executados, conforme a especificação documental da tarefa 83.

## Commit

Commit principal solicitado: `docs: corrigir lista do OpenBot e refazer fila (tarefa 83)`.
Hash: será preenchido após o commit e a conferência com `git log`.
Autor solicitado: Jadson Reis <jrdesign9@gmail.com>, sem `Co-Authored-By`.

## Pendente

O dono precisa reproduzir o ditado no exe com o token do app depois que o onboarding salvar `setup.json`. A causa observada nesta sessão foi a ausência desse arquivo local; não foi possível confirmar a reprodução autenticada no PC do dono. Não rodei testes nem typecheck, pois a tarefa proíbe essas execuções por não haver código.