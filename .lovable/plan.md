
# Plano — Motor de Personalização Genérico

## Verdade de fundo (importante ler antes)

Um app já publicado **não pode reescrever o próprio código-fonte em produção** como o Lovable faz — Lovable tem acesso ao repositório e ao build. Então "fazer qualquer coisa" na prática significa **uma de duas coisas**:

1. **Cobrir ~85% dos pedidos com um motor de runtime poderoso** — um conjunto rico de "primitivas" (renomear, esconder, reordenar, recolorir, criar regra de categoria, criar filtro salvo, mudar comportamento de listagem, etc.) que a IA combina como JSON e o app aplica em tempo de execução, sem precisar de deploy. Isso é o que vamos construir.
2. **Mandar o resto pro admin** (eu) implementar como mudança de código — exatamente o que o Lovable faz quando você pede algo fora do escopo do gerador.

Não existe caminho honesto onde 100% dos pedidos são executados automaticamente sem nenhum trabalho de desenvolvedor. O que existe é deixar a fronteira do "automático" o mais larga possível.

## Arquitetura proposta

```text
Pedido do usuário (NL)
       │
       ▼
┌──────────────────┐   conhece todas as
│  AI Interpreter  │◄──surfaces e operações
│  (Gemini Flash)  │   suportadas (Capability
└──────┬───────────┘   Registry)
       │ emite JSON tipado
       ▼
┌──────────────────────────────┐
│  Validador + Classificador   │
│  - "executável agora"  ──► aplica, vai p/ teste, depois ativo
│  - "precisa admin"     ──► fila de aprovação (admin pode codar)
│  - "ambíguo"           ──► pede esclarecimento ao usuário
└──────────────────────────────┘
       │
       ▼ (executável)
┌──────────────────────────────┐
│  Customization Store         │
│  (tabela customizations já   │
│  existe — extender schema)   │
└──────┬───────────────────────┘
       │ lido por hooks
       ▼
┌──────────────────────────────┐
│  Runtime Appliers            │
│  useCustomizedNav            │
│  useCustomizedCards          │
│  useCustomizedTheme          │
│  useCategorizationRules      │
│  useCustomFilters            │
│  useDashboardLayout          │
└──────────────────────────────┘
```

## Capability Registry — primitivas que vamos suportar de cara

Cada surface tem **chaves estáveis** e um set de operações. Tudo isso vira input do prompt da IA, então ela só pode emitir coisas válidas.

| Categoria | Operações | Exemplos de pedido |
|---|---|---|
| **Label/Text** | `rename(menu_key, new_label)` | "Chamar Contas de Contas Pessoais" ✅ já funciona |
| **Visibility** | `hide(surface_key)` / `show(surface_key)` | "Esconder card de Investimentos", "Tirar a aba Cartões" |
| **Ordering** | `reorder(surface_group, [keys...])` | "Colocar Transações antes de Contas no menu" |
| **Theme** | `set_color(token, value)` / `set_density(level)` | "Deixar o app mais escuro", "Cor primária verde" |
| **Categorization Rule** | `add_rule({when, then})` com operadores: `descriptor_contains`, `descriptor_equals`, `amount_equals`, `amount_multiple_of`, `amount_between`, `counterparty_matches`, `recurring_same_descriptor`, `recurring_same_counterparty` → ação: `set_category(name)`, `set_importance(level)` | "Recebimentos repetidos do mesmo nome todo mês = Aulas regulares"; "Valores de 290 ou múltiplo = Workshops" |
| **Filtros salvos** | `save_filter(page, name, criteria)` | "Salvar filtro 'Despesas essenciais deste ano' em Transações" |
| **Dashboard Layout** | `toggle_widget(key)` / `reorder_widgets([keys])` | "Tirar gráfico de pizza do dashboard" |
| **Default sort/grouping** | `set_default_sort(page, field, dir)` / `set_grouping(page, field)` | "Ordenar transações por valor decrescente por padrão" |
| **Validação de formulários** | `require_field(form, field)` / `make_optional(form, field)` | "Exigir descrição em toda transação" |

Tudo o que **não cair** numa dessas primitivas → fila do admin (`needs_admin_review`), com a interpretação da IA salva, e eu implemento código real depois (igual fluxo Lovable).

## Especificamente o seu exemplo das aulas/workshops

O pedido "transações positivas recorrentes com mesmo descritivo/pessoa = Aulas regulares" e "valor 290 ou múltiplo = Workshops" é **um caso de Categorization Rule** — entra como `add_rule` no motor acima. O sistema então:

1. Cria 2 registros em `importance_rules` (tabela já existe; vamos estender o schema):
   - Regra 1: `type=income AND counterparty_recurring_monthly=true → category="Aulas regulares"`
   - Regra 2: `type=income AND (amount=290 OR amount%290=0) → category="Workshops"`
2. Aplica retroativamente a todas as transações existentes que casam.
3. Aplica automaticamente em novas transações/importações.
4. Mostra no banner de teste: "X transações foram recategorizadas — manter?"

## Fases de entrega

### Fase 1 — Fundação (essencial pro motor funcionar)
- Estender tabela `customizations` com `operation_type` + `operation_payload` tipados
- Estender tabela `importance_rules` com novos operadores (`amount_multiple_of`, `recurring_same_descriptor`, `recurring_same_counterparty`)
- Criar **Capability Registry** em `src/lib/customization-registry.ts` — fonte única da verdade do que existe
- Reescrever prompt da IA pra conhecer o registry inteiro e emitir JSON validado por Zod
- Validador local que rejeita ops desconhecidas → admin queue

### Fase 2 — Appliers de UI (5 primitivas)
- `useCustomizedNav` (rename ✅, hide, reorder)
- `useCustomizedCards` (hide, reorder) — dashboard e páginas
- `useCustomizedTheme` (cor primária, modo denso/espaçado)
- Atualizar todos os componentes-chave (sidebar, dashboard, transactions, accounts) pra ler dos appliers em vez de hard-coded

### Fase 3 — Engine de regras (o seu caso de uso)
- Extender `src/lib/suggestions.ts` com novos operadores
- UI de gestão de regras em `/customizations` (listar, editar, deletar regras criadas via NL)
- Reprocessamento retroativo: quando uma regra nova é aprovada, rodar contra histórico
- Banner de teste mostra "N transações afetadas — aprovar?"

### Fase 4 — Filtros salvos + Dashboard layout
- Sistema de filtros salvos por página
- Reordenação/toggle de widgets do dashboard

### Fase 5 — Fila do admin com contexto
- Pedidos `needs_admin_review` mostram pra mim: interpretação da IA + por que não foi automatizado + sugestão de qual primitiva nova adicionaria a capacidade
- Eu (ou outro dev) implemento e a próxima vez aquele tipo de pedido vira automático

## O que isso resolve vs não resolve

**Resolve automaticamente:** renomear, esconder/mostrar, reordenar, recolorir, criar regras de categorização (incluindo seu caso), salvar filtros, mudar ordenação padrão, toggle de widgets.

**Continua precisando de admin:** criar uma página nova do zero, integrar com API externa nova, mudar fundamentalmente como uma feature funciona (ex: "trocar transações por entradas de diário"), criar gráficos com tipos novos de visualização, lógicas de negócio muito específicas.

## Detalhes técnicos resumidos

- Stack: TanStack Start, Supabase. AI via Lovable AI Gateway com `google/gemini-3-flash-preview`, structured output (Zod schema espelhando o registry).
- Migrações: `customizations.operation_type`/`operation_payload`; `importance_rules` ganha colunas `operator`, `amount_operator`, `recurrence_window_days`, `counterparty_match`.
- Hooks novos em `src/hooks/`, leem `customizations` + `importance_rules` ativos via React Query com `staleTime` curto.
- Registry exportado pra ser injetado no prompt — quando adicionarmos primitiva nova, prompt atualiza sozinho.
- Fluxo de teste (`testing` → `approved`/`rejected` via banner) já existe e continua sendo usado pra toda mudança.

## Estimativa de esforço

- Fase 1: ~3 turnos
- Fase 2: ~2 turnos
- Fase 3 (seu caso): ~2 turnos
- Fase 4: ~2 turnos
- Fase 5: ~1 turno

Posso começar pela **Fase 1 + Fase 3** se você quer ver o seu exemplo de aulas/workshops funcionando antes do resto — é o caminho mais curto pra valor concreto. Ou posso seguir 1→2→3→4→5 sequencial. Me diz.
