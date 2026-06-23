## Personalizações — V0

Objetivo: entregar a aba **Personalizações** funcional, com sistema de créditos mensais por workspace, pedidos em linguagem natural interpretados por IA, histórico, e aplicação automática das personalizações simples (renomear label, ocultar card, criar regra, criar filtro salvo, criar categoria).

### 1. Banco de dados (uma migration)

Criar tabelas no schema `public` com RLS + GRANT (membros do workspace):

- **customization_requests** — `workspace_id`, `user_id`, `request_text`, `request_type` (simple/medium/advanced), `status` (pending/analyzing/approved/applied/rejected/in_review), `estimated_credits`, `approved_credits`, `ai_interpretation` (jsonb), `applied_customization_id`, `approved_at`, `completed_at`.
- **customizations** — `workspace_id`, `type` (`label_rename` | `card_visibility` | `category_rule` | `saved_filter` | `new_category` | `dashboard_card`), `name`, `description`, `configuration_json` (jsonb), `is_active`, `created_by`, `request_id`.
- **customization_credits** — `workspace_id`, `period_month`, `period_year`, `credits_included`, `credits_used`, `credits_remaining` (gerado), `expires_at`. Único por (workspace, mês, ano).
- **customization_usage** — `workspace_id`, `request_id`, `credits_used`, `usage_reason`.

Adicionar `plan` (text, default `'personal'`) em `workspaces`. Mapa de créditos/plano (constante no frontend): personal=3, personal_plus=8, business=10, business_pro=25.

Função `ensure_current_credits(_workspace_id uuid)` (SECURITY DEFINER): cria a linha do mês atual se não existir, usando o plano do workspace. Chamada ao abrir a página.

Função `consume_credits(_workspace_id uuid, _request_id uuid, _credits int, _reason text)` (SECURITY DEFINER): valida saldo, atualiza `credits_used`, insere `customization_usage`. Retorna boolean.

### 2. Server function de interpretação (Lovable AI)

`src/lib/customizations.functions.ts` — `interpretCustomization` protegido por `requireSupabaseAuth`:

- Input: `{ workspace_id, request_text }`.
- Chama Lovable AI Gateway (`google/gemini-2.5-flash`) com system prompt que retorna JSON estruturado:
  ```json
  { "type": "label_rename|card_visibility|category_rule|saved_filter|new_category|other",
    "complexity": "simple|medium|advanced",
    "estimated_credits": 1,
    "summary": "...",
    "configuration_json": { ... },
    "auto_appliable": true }
  ```
- Persiste `customization_requests` com `ai_interpretation`, `estimated_credits`, `request_type`.
- Retorna o pedido criado (não aplica ainda — confirmação do usuário em etapa 2).

`applyCustomization` (server fn): valida ownership, chama `consume_credits`, cria linha em `customizations` com `is_active=true`, marca pedido como `applied`. Pedidos `medium`/`advanced` ficam `in_review` (sem consumir créditos).

### 3. Tela `/customizations`

Layout em duas colunas (stack no mobile):

**Topo — cards de créditos**
- Créditos do mês / usados / restantes (barra de progresso terracota).
- Badge do plano atual + link "ver planos" (modal só informativo na V0).

**Coluna esquerda — Novo pedido**
- `Textarea` grande com placeholder rotativo dos exemplos da spec.
- Botão "Interpretar pedido" → chama `interpretCustomization`, mostra card de prévia: tipo, complexidade, créditos estimados, resumo, JSON colapsável.
- Se `auto_appliable` e há créditos: botão **Aplicar agora** (consome créditos). Se `medium`/`advanced`: botão **Enviar para análise**. Botão **Descartar**.

**Coluna direita — Tabs**
- **Histórico de pedidos** — lista cronológica com status colorido, créditos, data, ações (reaplicar / descartar).
- **Personalizações ativas** — agrupadas por tipo, cada item com switch `is_active` e botão "Remover".

### 4. Aplicação efetiva das personalizações ativas

Hook `useActiveCustomizations(workspaceId)` retorna mapa `{ labelRenames, hiddenCards, savedFilters, categoryRules, newCategories }`.

- **label_rename**: estender `src/lib/labels.ts` para mesclar com `labelRenames` antes de devolver o texto. Aplica em sidebar, page headers, dashboard.
- **card_visibility**: dashboard filtra cards cujo `id` está em `hiddenCards`.
- **category_rule**: ao criar/importar transações, percorrer regras ativas e sugerir categoria (usa lógica já existente em `csv.ts` + nova chamada em `transaction-dialog.tsx`).
- **saved_filter**: lista de chips na tela de Transações para aplicar filtros salvos.
- **new_category**: cria de fato linha em `categories` no momento do apply (não fica só em `customizations`).

### 5. Navegação

Adicionar item **Personalizações** (ícone `Sparkles`) no `app-shell.tsx` entre Categorias e Importar. Atualizar o card "Personalizações" em `settings.tsx` para linkar para a nova rota.

### Detalhes técnicos

- Toda comunicação com banco via `supabase` cliente (RLS aplica). `interpretCustomization` é a única server fn (precisa da `LOVABLE_API_KEY`).
- Validação no frontend com `zod` para `configuration_json` por tipo, antes de aplicar.
- Toasts para sucesso/erro. Estados de loading em todos os botões.
- Privacy mode respeitado (não afeta esta tela, mas valores em cards de créditos não são sensíveis).
- Tipos em `src/integrations/supabase/types.ts` ficam desatualizados até a migration rodar; usar `as any` localizado nas queries das novas tabelas, como já feito em `budget-analysis.tsx`.

### Fora do escopo desta entrega

- Pagamento real de planos (mock).
- Personalizações médias/avançadas geram código real (ficam só em "Em análise").
- Card calculado custom (`dashboard_card` complexo) — estrutura existe mas renderização fica para próxima fase.
