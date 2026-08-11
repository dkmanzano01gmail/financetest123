# Relatório de validação

Data: 26/07/2026

## Concluído

- 109 arquivos TypeScript/TSX analisados pelo parser do TypeScript: **0 erros de sintaxe**.
- Resolução de todos os imports locais `@/`: **aprovada**.
- `scripts/run-tests.mjs`: sintaxe JavaScript aprovada e preparado para execução com Bun.
- Testes isolados das regras Orna executados por transpilação local:
  - dashboard atual × mês anterior;
  - recorrência mensal com ajuste do dia 31 em fevereiro;
  - perfil real do forno para cone 6;
  - lucro da peça sem incidência sobre mão de obra;
  - ponto de equilíbrio do workshop com taxas e imprevistos;
  - perfis separados de biscoito e esmalte nas aulas regulares.
- Resultado dos testes isolados: **aprovado**.
- Migration aplicada no banco conectado e verificada:
  - `feedback_comments`: pronta;
  - `firing_settings`: pronta;
  - `class_material_settings`: pronta;
  - dados existentes preservados: 206 transações, 14 alunos e 33 matérias-primas no workspace Business.

## Limitação deste ambiente

O build completo não pôde ser executado porque o ambiente do ChatGPT não conseguiu baixar as dependências:

- registry interno retornou HTTP 503 para `@lovable.dev/vite-tanstack-config`;
- `registry.npmjs.org` não estava acessível por DNS.

O erro ocorreu antes da instalação e não foi causado pelo código. Execute `npm ci && npm run build` no Mac antes do push; os comandos estão em `PUSH-TO-GITHUB.md`.

## Personalizações por escopo (MVP seguro)

Automatizado em `scripts/run-tests.mjs`: isolamento entre usuários, precedência user > workspace,
compatibilidade dos registros legados, teste > definitivo, member não autoaplica workspace,
payload de IA inválido/extra rejeitado, dados compartilhados e cálculos nunca autoaplicados.

Cenários manuais:
1. Usuário A pede "Somente para mim" → banner de teste aparece só para A; usuário B não vê nada.
2. Owner pede "Todo o workspace" → em teste para todos; member/viewer só consegue pedir para si.
3. Pedido de novo cálculo → status "Em análise" com a mensagem de validação financeira.
4. Aprovar teste → créditos cobrados uma única vez (clicar duas vezes não duplica).
5. Rejeitar teste → customização removida, app volta ao estado anterior, sem cobrança.
6. Personalizações antigas (sem escopo) continuam visíveis para o workspace todo.
