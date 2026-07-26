# Paridade com o Apps Script da Orna

Este pacote replica no Selá Finance as regras finais encontradas nos arquivos `Código.js` e `Index.html` do dashboard Apps Script da Orna. A implementação foi adaptada para React/TanStack Query e Supabase, preservando isolamento por workspace e evitando fórmulas dependentes de uma planilha.

## Áreas replicadas

- **Dashboard:** resumo mensal e anual, comparação com o mês anterior, margem líquida, índice de despesas, ticket médio, médias mensais, categorias, benchmarks e maiores lançamentos.
- **Transações, categorias e importação Nubank:** histórico categorizado, edição, exclusão, importação idempotente e sugestões baseadas no histórico e nos comentários das categorias.
- **Cartão de crédito:** compras por mês, estornos, limite, pagamentos de fatura e diferença de conciliação.
- **Conta corrente:** saldo de abertura, movimentação diária, saldo acumulado e conciliação por dia.
- **Fluxo de caixa:** expansão de lançamentos únicos, semanais, mensais e anuais; dia 29–31 ajustado ao último dia do mês; curva prevista; curva realizada; previsão após o último realizado; saldo mínimo; primeira data negativa e necessidade de caixa.
- **Matérias-primas:** estoque, custo, fornecedor, links, lote, validade, temperatura/cone, localização e alerta de estoque baixo. Exclusão foi melhorada para inativação, preservando histórico.
- **Materiais das aulas regulares:** custo de argila, esmalte e queimas por perfil/cone; cobrança, pagamentos parciais, mensalidade e resumo por aluno.
- **Presença e reposições:** presenças, faltas, justificativas, reposições geradas/utilizadas e limite mensal de dois créditos.
- **Alunos:** turma, mensalidade, status e receita mensal recorrente. Remoção foi substituída por inativação segura.
- **Reforma:** orçamento, realizado, pago, pendente, variação, categoria, área, prioridade e forma de pagamento.
- **Queimas:** parâmetros reais do forno Orna/Yby, perfis de biscoito e cones 6, 7 e 10, custo de energia, resistência, ocupação do forno e margem de cobrança.
- **Precificação de peças:** argila, esmalte, queimas, lucro da queima, perdas, mão de obra, embalagem, custos adicionais, margem, taxas, impostos e desconto esperado. O lucro desejado segue a regra do Apps Script e não incide sobre a mão de obra.
- **Workshops:** custos fixos/variáveis, espaço, materiais, queimas, alimentação, embalagem, mão de obra, taxas, impostos, reserva para imprevistos, lucro e ponto de equilíbrio.
- **Comentários:** registro de comentários, erros, ideias, dúvidas e melhorias, com filtros e fluxo de status dentro do app. O envio de e-mail do Apps Script foi substituído por um histórico interno, evitando credenciais de e-mail no frontend.

## Parâmetros do forno reproduzidos

- Custo das resistências: R$ 2.000
- Energia: R$ 1/kWh
- Potência: 9,85 kW
- Diâmetro útil: 57 cm
- Fator de ajuste de área: 1,0825
- Buffer final: 10%
- Biscoito: 275 queimas, 9 h, utilização de 65%
- Cone 6: 175 queimas, 10,5 h, utilização de 75%
- Cone 7: 150 queimas, 11 h, utilização de 78%
- Cone 10: 110 queimas, 12 h, utilização de 90%

Todos esses parâmetros continuam editáveis no app.

## Migração obrigatória

Antes de usar as telas atualizadas, aplique:

`supabase/migrations/20260726030000_apps_script_logic_parity.sql`

A migração é idempotente: usa `IF NOT EXISTS` onde aplicável e preserva configurações personalizadas. Ela adiciona os campos detalhados, configurações de queima, parâmetros de aulas e a tabela de comentários.

## Validação local

Com as dependências instaladas:

```bash
bun scripts/run-tests.mjs
bun run build
```

Ou, com npm:

```bash
npm ci
npm run build
```

## Publicação pelo GitHub

Depois de copiar este pacote sobre o clone do repositório conectado à Lovable:

```bash
git add .
git commit -m "Replica logicas do Apps Script da Orna"
git push origin main
```

A Lovable receberá o código pela sincronização Git. A publicação do domínio pode exigir **Publish → Update** dentro do projeto.
