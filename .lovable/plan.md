# Selá Cerâmica — Transformação do app

Preserva 100% de: auth, workspaces, transações, contas, cartões, categorias, orçamento, conciliação, personalizações (testing/approval), CSV import, privacidade. Nada é substituído por mock.

## Ordem de execução (por prioridade declarada)

1. Rebrand visual + design system Selá
2. Dashboard financeiro refinado
3. Fluxo de caixa
4. Precificação de peças
5. Matéria-prima
6. Lista de presença
7. Material Aulas Regulares
8. Reforma do Ateliê
9. Precificação de workshops
10. Precificação de queimas
11. Seed defaults Selá (workspaces business, idempotente)
12. Import Nubank + Auto-classificar (melhorias sobre o existente)

Se o orçamento de uma passagem não cobrir tudo, entrego o máximo em sequência e reporto o pendente ao final.

## 1. Rebrand + Design System

- `src/styles.css`: substituo paleta atual pelos tokens Selá (Plum, Wine, Ivory, Sand, Gold, Sage, Beige, Terracotta, Ochre, Brown, Dark brown) em oklch, mantendo nomes semânticos shadcn (`--primary`=Wine, `--background`=Ivory, `--sidebar`=Plum, `--accent`=Gold etc.).
- Fontes carregadas via `<link>` no `__root.tsx` (Google Fonts: Cantarell, Cutive Mono, Caveat Brush). `@theme` mapeia `--font-sans: Cantarell`, `--font-mono: "Cutive Mono"`, `--font-display: "Caveat Brush"`.
- Utilitário `.font-mono` já usado para valores; adiciono `.font-accent` (Caveat Brush) e restrinjo uso.
- `app-shell.tsx`: marca "Selá" + subtítulo alterna "Cerâmica" (business) / "Financeiro" (personal). Mobile idem. Preserva `useCustomizedUI` + `useLabelOverrides`.
- `auth.tsx` e `onboarding.tsx`: novo branding.

## 2. Dashboard

Reescreve `dashboard.tsx` mantendo queries Supabase atuais, adiciona:
- filtros mês/ano no topo (com "todos")
- 4 stat cards: Receitas, Despesas, Resultado, Saldo em contas (respeita `hiddenCards` + `dashboard_widget_order`)
- gráfico Entradas × Saídas por mês (Recharts BarChart)
- breakdown despesas por categoria (PieChart)
- breakdown receitas por categoria (PieChart)
- transações recentes (10 últimas)
- empty states claros, privacidade via `workspace.privacy_mode`

## 3. Modelo de dados novo (uma única migração)

Todas as tabelas seguem o padrão: `workspace_id` + GRANT authenticated/service_role + RLS via `is_workspace_member`. Sem duplicar `is_workspace_member`. Todas com `created_at/updated_at` + trigger.

- `cash_flow_entries` (date, type income/expense, description, category_id, amount, recurrence none/weekly/monthly/yearly, status projected/realized, notes)
- `cash_flow_settings` (workspace_id PK, starting_balance, starting_balance_date)
- `raw_materials` (name, material_type, supplier, unit, quantity_purchased, quantity_available, unit_cost, purchase_date, min_stock, notes)
- `class_materials_usage` (student_name, material, grams, amount_charged, payment_status pending/paid, payment_date, comments)
- `attendance_records` (session_date, weekday int, session_time, student_name, status present/absent/justified, confirmed_at, comments)
- `renovation_items` (title, category, supplier, budget_amount, actual_amount, due_date, payment_date, payment_status pending/partial/paid, status planned/in_progress/done, notes)
- `piece_pricing` (name, height_cm, length_cm, depth_cm, clay_grams, clay_cost, glaze_grams, glaze_cost, biscuit_cost, glaze_firing_cost, labor_cost, packaging_cost, other_cost, margin_percent, suggested_price, notes)
- `piece_pricing_defaults` (workspace_id PK; clay_kg_price, glaze_gram_price, biscuit_coeff 0.0045, glaze_coeff 0.007, default_labor, default_packaging, default_margin)
- `workshop_pricing` (name, event_date, attendees, price_per_person, clay_cost, glaze_cost, firing_cost, food_cost, labor_cost, other_cost, total_revenue, total_cost, profit, margin)
- `firing_pricing` (reference default 'Yby 10Z2', firing_date, firing_type biscuit/glaze, total_internal_cost, total_charges, profit, notes)
- `firing_pieces` (firing_id, customer_name, piece_name, height_cm, length_cm, depth_cm, quantity, internal_cost, charge_customer bool, charge_amount)

Trigger `update_updated_at_column` já existe — reutilizo.

## 4. Rotas novas (todas em `_authenticated/`)

- `atelier/cash-flow.tsx`
- `atelier/raw-materials.tsx`
- `atelier/class-materials.tsx`
- `atelier/attendance.tsx`
- `atelier/renovation.tsx`
- `atelier/piece-pricing.tsx`
- `atelier/workshop-pricing.tsx`
- `atelier/firing-pricing.tsx`

Cada rota: `ssr: false`, filtros, tabela editável, dialog de criar/editar, delete confirm. Uso `useCurrentWorkspace().workspace.id` como escopo. Consultas via `supabase` client no browser (RLS aplica).

Sidebar (`app-shell.tsx`): adiciono seção agrupada "Ateliê" com esses 8 itens, cada um com `key` estável (`nav.atelier.cashflow`, `nav.atelier.materials` etc.) para o motor de personalização hidratar/renomear/ocultar/reordenar.

## 5. Cálculos (Precificação)

Editáveis em `piece_pricing_defaults`. Fórmulas expostas no UI:
- biscuit = coeff × h × l × d (default 0.0045)
- glaze_firing = coeff × h × l × d (default 0.007)
- clay_cost = grams × (kg_price/1000) — default 77/10000 = 0.0077
- glaze_cost = grams × glaze_gram_price (default 1)
- total_cost = clay + glaze + biscuit + glaze_firing + labor + packaging + other
- suggested_price = total_cost × (1 + margin_percent/100)

## 6. Seed Selá (workspaces business)

Botão em `settings.tsx` "Aplicar defaults Selá Cerâmica" — server function ou RPC que:
- insere categorias listadas apenas se não existir (name + type + workspace_id)
- insere contas: Nubank Selá (checking), Cartão Nubank Selá (via cartão), Lançamento manual (cash) — só se não existir
Não roda automático; é opt-in para evitar mudar dados existentes.

## 7. Import Nubank + Auto-classificar

O `import.tsx` atual já cobre CSV com preview + dedupe hash + sugestões. Aplico ajustes pontuais:
- presets de mapeamento "Nubank Conta" e "Nubank Cartão"
- botão "Auto-classificar" em `transactions.tsx` que roda `suggestRulesFor` no conjunto **filtrado visível** e aplica em lote.
- campo `importance_comment` já existe em `categories`; adiciono campo textarea no editor de categorias (`categories.tsx`) e uso como contexto extra no ranking.

## 8. Detalhes técnicos

- Todas as novas queries via `supabase` (browser client) com RLS — sem `service_role`.
- Migration única para não fragmentar; policies uniformes `USING (public.is_workspace_member(workspace_id, auth.uid()))`.
- GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated + GRANT ALL TO service_role.
- `updated_at` via trigger.
- Fórmulas em `src/lib/pricing.ts` puras + testes manuais no dialog.
- Mobile: chips scroll horizontal já existente comporta os novos itens; mantido.
- Sem quebrar rotas existentes (`/dashboard`, `/transactions`, `/accounts`, `/cards`, `/categories`, `/budget-analysis`, `/reconciliation`, `/import`, `/customizations`, `/settings`, `/super-admin/customizations`).

## Diagrama do sidebar final

```
Financeiro
  Dashboard
  Transações
  Contas
  Cartões
  Análise de Orçamento
  Conciliação
  Categorias
  Importar
Ateliê
  Fluxo de caixa
  Matéria-prima
  Material Aulas
  Lista de presença
  Reforma
  Precificação de Peças
  Workshops
  Queimas
Sistema
  Personalizações
  Configurações
  (Aprovações admin, se super-admin)
```

## Entrega

Vou executar em uma sequência de passagens. Ao final de cada bloco crítico (rebrand, dashboard, migração, módulos ateliê, import/auto-class), reporto progresso. Se algum módulo ficar pendente por limite de contexto, listo explicitamente o que falta e como retomar.