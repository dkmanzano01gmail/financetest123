export const helpContent = {
  "financial.dashboard": {
    title: "Como usar o Dashboard",
    summary: "Aqui você acompanha rapidamente como está o mês selecionado.",
    bullets: [
      "Use os filtros de mês e ano para mudar o período analisado.",
      "Receitas, despesas e saldo usam as transações registradas no período.",
      "Clique em categorias e indicadores para abrir os lançamentos relacionados.",
    ],
  },
  "financial.transactions": {
    title: "Como usar Transações",
    summary: "Esta é a lista completa de entradas, despesas e compras do cartão.",
    bullets: [
      "Use os filtros para encontrar lançamentos por período, categoria, conta ou cartão.",
      "Compras no cartão entram no mês financeiro da fatura configurada.",
      "Edite a categoria quando quiser melhorar os relatórios e as sugestões futuras.",
    ],
  },
  "financial.accounts": {
    title: "Como usar Contas",
    summary: "Cadastre contas bancárias e carteiras usadas para movimentar dinheiro.",
    bullets: [
      "O saldo inicial é opcional e deve representar o valor na data informada.",
      "Transações vinculadas à conta ajudam a formar o saldo calculado.",
      "Inative uma conta antiga para preservá-la no histórico sem usá-la em novos registros.",
    ],
  },
  "financial.cards": {
    title: "Como usar Cartões",
    summary: "Acompanhe compras, faturas e pagamentos sem contar a mesma despesa duas vezes.",
    bullets: [
      "Configure fechamento e vencimento para cada compra cair na fatura correta.",
      "Importe as compras detalhadas do cartão e depois vincule o pagamento feito pela conta.",
      "A compensação preserva o movimento bancário, mas elimina a duplicidade nos relatórios.",
    ],
  },
  "financial.budget": {
    title: "Como usar Análise de Orçamento",
    summary: "Compare hábitos de gasto e identifique onde existe espaço para economizar.",
    bullets: [
      "A análise usa transações categorizadas, inclusive lançamentos futuros cadastrados.",
      "Quanto melhor a classificação, mais úteis serão os comparativos.",
      "Use os resultados como orientação; confirme sempre se a categoria faz sentido.",
    ],
  },
  "financial.reconciliation": {
    title: "Como usar Conciliação",
    summary: "Compare o saldo calculado pelo aplicativo com o saldo real mostrado pelo banco.",
    bullets: [
      "Escolha uma conta e informe o saldo real na data da conferência.",
      "Diferenças normalmente indicam lançamentos ausentes, duplicados ou com sinal incorreto.",
      "Corrija as transações antes de concluir a conciliação.",
    ],
  },
  "financial.categories": {
    title: "Como usar Categorias",
    summary: "Categorias organizam os valores exibidos nos relatórios e gráficos.",
    bullets: [
      "Separe categorias de entrada e de despesa.",
      "O comentário pode explicar quando uma categoria deve ser sugerida automaticamente.",
      "Evite criar nomes muito parecidos para não fragmentar os relatórios.",
    ],
  },
  "financial.import": {
    title: "Como importar arquivos",
    summary: "Envie um CSV de conta corrente ou cartão e revise tudo antes de confirmar.",
    bullets: [
      "Escolha primeiro se o arquivo pertence a uma conta ou a um cartão.",
      "Confira data, descrição, valor e sinal na prévia.",
      "Duplicidades são detectadas automaticamente, mas a revisão final continua importante.",
    ],
  },
  "financial.cash-flow": {
    title: "Como usar Fluxo de Caixa",
    summary: "Veja o que realmente movimentou a conta e o que ainda está previsto.",
    bullets: [
      "O realizado considera somente movimentos de contas correntes.",
      "Cadastre receitas e despesas futuras para formar o saldo previsto.",
      "Compensações contábeis de cartão não alteram o fluxo bancário realizado.",
    ],
  },
  "atelier.raw-materials": {
    title: "Matéria-prima",
    summary: "Controle estoque, unidade de compra, custo e informações técnicas dos materiais.",
    bullets: [
      "Use a mesma unidade em que o material é consumido nos cálculos.",
      "Atualize o custo quando houver uma nova compra ou mudança relevante de preço.",
      "Compatibilidade e observações ajudam a evitar combinações inadequadas.",
    ],
  },
  "atelier.class-materials": {
    title: "Materiais de aulas regulares",
    summary: "Registre cada peça produzida e acompanhe custo, cobrança e pagamento por aluno.",
    bullets: [
      "Peso, esmalte e dimensões formam os componentes do custo da peça.",
      "Escolha quais custos de forno serão incluídos na cobrança.",
      "O resumo do aluno separa argila, esmalte, queimas, outros custos e valores pendentes.",
    ],
  },
  "atelier.attendance": {
    title: "Lista de presença",
    summary: "Confirme aulas, faltas e reposições dos alunos por turma.",
    bullets: [
      "A confirmação rápida registra a turma inteira e permite ajustar exceções.",
      "Use reposição apenas quando a aula compensar uma falta anterior.",
      "Revise mês e turma antes de salvar para manter o histórico correto.",
    ],
  },
  "atelier.students": {
    title: "Alunos",
    summary: "Centralize perfil, turma, mensalidade, frequência, produção e pagamentos.",
    bullets: [
      "Selecione a turma entre as opções cadastradas.",
      "Inativar preserva o histórico do aluno sem incluí-lo nas rotinas atuais.",
      "Abra o perfil para conferir presença, peças e valores em diferentes períodos.",
    ],
  },
  "atelier.kilns": {
    title: "Fornos",
    summary: "Os parâmetros cadastrados aqui alimentam os cálculos de queima.",
    bullets: [
      "Confira volume útil, potência, duração, energia e ocupação do forno.",
      "Cadastre custo e vida útil das resistências para calcular manutenção por queima.",
      "Defina um forno padrão quando ele for usado na maioria dos registros.",
    ],
  },
  "atelier.renovation": {
    title: "Reforma do Ateliê",
    summary: "Compare orçamento e gasto real de cada item da reforma.",
    bullets: [
      "Cadastre o valor orçado antes da compra sempre que possível.",
      "Atualize pagamento e responsável para facilitar a prestação de contas.",
      "Use ambiente e prioridade para organizar o que deve ser feito primeiro.",
    ],
  },
  "atelier.piece-pricing": {
    title: "Precificação de Peças",
    summary: "Monte um preço transparente a partir de materiais, trabalho, queimas e margem.",
    bullets: [
      "Revise cada componente do custo antes de aplicar margem e impostos.",
      "Tempo de trabalho deve refletir todas as etapas de produção.",
      "Use o preço sugerido como referência e registre ajustes comerciais separadamente.",
    ],
  },
  "atelier.workshop-pricing": {
    title: "Precificação de Workshops",
    summary: "Calcule custo total, custo por pessoa, ponto de equilíbrio e margem do evento.",
    bullets: [
      "Separe custos fixos dos custos que aumentam por participante.",
      "Informe a quantidade esperada para estimar receita e margem.",
      "Compare o ponto de equilíbrio com a capacidade real do workshop.",
    ],
  },
  "atelier.firing-pricing": {
    title: "Precificação de Queimas",
    summary: "Calcule o custo de cada queima e distribua o valor entre as peças.",
    bullets: [
      "Energia e manutenção vêm dos parâmetros do forno selecionado.",
      "Dimensões e ocupação definem a parcela de custo de cada peça.",
      "Você pode cobrar o custo completo ou somente a manutenção do forno.",
    ],
  },
} as const;

export type HelpKey = keyof typeof helpContent;
