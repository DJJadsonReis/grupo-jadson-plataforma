import type { RichComponent } from "./rich-components";

export const RICH_COMPONENTS_EXAMPLES: { tipo: string; titulo: string; component: RichComponent }[] = [
  { tipo: "cartao", titulo: "Cartão", component: { tipo: "cartao", titulo: "Resumo semanal", corpo: "A equipe concluiu 18 tarefas nesta semana." } },
  { tipo: "tabela", titulo: "Tabela", component: { tipo: "tabela", colunas: ["Pessoa", "Tarefas"], linhas: [["Ana", "8"], ["Rui", "10"]] } },
  { tipo: "barras", titulo: "Barras", component: { tipo: "barras", titulo: "Atendimentos", itens: [{ rotulo: "Segunda", valor: 12 }, { rotulo: "Terça", valor: 19 }, { rotulo: "Quarta", valor: 15 }] } },
  { tipo: "grafico", titulo: "Gráfico de linha", component: { tipo: "grafico", titulo: "Tarefas por semana", formato: "linha", rotulos: ["Sem. 1", "Sem. 2", "Sem. 3"], series: [{ nome: "Concluídas", valores: [8, 12, 17] }, { nome: "Planejadas", valores: [10, 14, 20] }] } },
  { tipo: "grafico", titulo: "Gráfico de pizza", component: { tipo: "grafico", titulo: "Distribuição de tarefas", formato: "pizza", rotulos: ["Concluídas", "Em andamento", "Pendentes"], series: [{ nome: "Tarefas", valores: [18, 7, 5] }] } },
];
