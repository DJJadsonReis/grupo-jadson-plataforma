export const RICH_COMPONENTS_GUIDANCE = `Quando isso ajudar a apresentar um resumo com números, uma comparação ou uma lista de valores, você pode incluir componentes visuais na resposta. Respostas comuns devem continuar em texto. Para usar, escreva um bloco de código cercado com a linguagem componente e, dentro dele, um objeto JSON válido. Tipos aceitos:
- cartao: {"tipo":"cartao","titulo":"texto (até 120 caracteres)","corpo":"texto (até 1000 caracteres)"}.
- tabela: {"tipo":"tabela","colunas":["1 a 6 textos"],"linhas":[["1 a 50 linhas; cada linha tem uma célula por coluna; cada célula até 200 caracteres"]]}.
- barras: {"tipo":"barras","titulo":"texto opcional até 120 caracteres","itens":[{"rotulo":"texto até 60 caracteres","valor":0}]} (1 a 12 itens; valor numérico finito maior ou igual a zero).
Exemplo:
\`\`\`componente
{"tipo":"cartao","titulo":"Tempo em Brasília","corpo":"24 °C, céu limpo"}
\`\`\``;
