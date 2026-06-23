
## Objetivo

Transformar o módulo **Personalizações** em um fluxo de aprovação real, com três atores:

1. **Lovable AI** — interpreta automaticamente cada pedido e aplica sozinha o que for "fácil" (ex.: renomear labels, mudar textos da UI).
2. **Super-admin (você)** — recebe em uma fila global os pedidos que a IA considerou "avançados" (ex.: mudar paleta, criar feature nova) e decide aplicar ou rejeitar.
3. **Usuário do workspace** — quando uma personalização é aplicada, ela entra em modo **"em teste"**. Ele navega pelo app, vê a mudança em produção e clica em **Aprovar** ou **Rejeitar**. Se rejeitar, o sistema faz **rollback** automático e a UI volta exatamente como estava.

---

## Nova máquina de estados de `customization_requests`

```text
                  ┌─────────────────────────────────────────┐
                  │                                         ▼
submitted ─► interpreting ─► auto_applicable ─► testing ─► approved
                │                                  │
                │                                  └─► rejected (rollback)
                └─► needs_admin_review ─► (admin) ─┤
                                          │       └─► rejected_by_admin
                                          └─► testing ─► approved / rejected
```

Estados:
- `submitted` — usuário acabou de enviar.
- `interpreting` — Lovable AI está classificando (assíncrono).
- `auto_applicable` — IA classificou como fácil; vai aplicar sozinha.
- `needs_admin_review` — IA classificou como avançada; entra na fila do super-admin.
- `rejected_by_ai` — IA rejeitou (fora de escopo, inseguro, vazio).
- `rejected_by_admin` — super-admin rejeitou.
- `testing` — mudança aplicada; aguardando aprovação do usuário.
- `approved` — usuário aprovou; mudança permanente.
- `rejected` — usuário rejeitou no teste; rollback executado.

---

## Mudanças no banco

Migration única:

1. **`customization_requests`** — novas colunas:
   - `status` (substitui o atual; enum com os estados acima)
   - `complexity` (`easy` | `advanced`) — classificação da IA
   - `ai_classification_reason` (text)
   - `auto_applied` (boolean)
   - `tested_at`, `approved_at`, `rejected_at` (timestamps)
   - `rollback_payload` (jsonb) — snapshot do estado anterior para reverter

2. **`super_admins`** (tabela nova, global, fora de workspace):
   ```
   user_id uuid PRIMARY KEY references auth.users
   created_at timestamptz
   ```
   Função `is_super_admin(uuid)` SECURITY DEFINER. Você é seeded como super-admin via migration (seu user_id atual).

3. **Policies novas**:
   - super-admins podem `SELECT/UPDATE` qualquer `customization_request` em qualquer workspace.
   - membros do workspace só veem os seus.

4. **RPCs novas** (todas SECURITY DEFINER):
   - `admin_approve_request(_request_id)` — só super-admin; move para `testing` e aplica.
   - `admin_reject_request(_request_id, _reason)` — só super-admin.
   - `user_approve_test(_request_id)` — membro do workspace; finaliza como `approved`.
   - `user_reject_test(_request_id)` — membro; executa rollback e marca como `rejected`.

---

## Fluxo de "auto-aplicar fácil"

Server function `interpret_and_route_request` (TanStack `createServerFn` + Lovable AI):

1. Chama `google/gemini-3-flash-preview` com schema estruturado:
   ```json
   {
     "complexity": "easy" | "advanced",
     "reason": "...",
     "action": {
       "type": "rename_label" | "rename_category" | "rename_account" | "none",
       "target": "...",
       "new_value": "..."
     } | null,
     "credits_estimate": 1..30
   }
   ```
2. Se `complexity = easy` e `action.type ≠ none`:
   - grava `rollback_payload` (valor atual)
   - aplica a mudança em `customizations` (mesma tabela já existente)
   - marca `status = testing`, `auto_applied = true`
3. Se `complexity = advanced`:
   - marca `status = needs_admin_review`

Chamada assim que o usuário envia o pedido (substitui o passo manual de "Interpretar com IA").

---

## Fluxo de teste do usuário (rollback)

Na aba de Personalizações, qualquer pedido com `status = testing` mostra um banner sticky no topo do app inteiro (via `AppShell`):

> ⚠️ Testando personalização: "muda o nome da tab contas para contas 2.0"
> [Aprovar mudança] [Rejeitar e reverter]

- **Aprovar** → `user_approve_test` → status `approved`. Banner some.
- **Rejeitar** → `user_reject_test`:
  - lê `rollback_payload`
  - reverte a entrada em `customizations` (delete ou volta valor anterior)
  - status `rejected`. Banner some, UI volta ao original.

Limite: só **uma** personalização em `testing` por workspace por vez (constraint parcial unique), para não embaralhar testes.

---

## Tela do super-admin

Nova rota `/super-admin/customizations` (gated por `is_super_admin`):
- Lista global de pedidos com `status = needs_admin_review` de todos os workspaces.
- Cada card mostra: workspace, autor, pedido, interpretação da IA, motivo, créditos estimados.
- Ações: **Aprovar e aplicar** (vai para `testing` no workspace do usuário) / **Rejeitar com motivo**.
- Item no menu lateral só aparece se `is_super_admin(auth.uid()) = true`.

---

## Arquivos a criar / editar

**Banco:**
- `supabase/migrations/<timestamp>_customization_approval_flow.sql` — migration única com tudo acima + seed do super-admin.

**Server:**
- `src/lib/customizations.functions.ts` — adicionar `interpretAndRouteRequest`, `adminApproveRequest`, `adminRejectRequest`, `userApproveTest`, `userRejectTest`, `listAdminQueue`, `getActiveTest`.
- `src/lib/ai-gateway.server.ts` — helper de provider Lovable AI (se ainda não existir).

**UI:**
- `src/routes/_authenticated/customizations.tsx` — atualizar para nova máquina de estados; remover botão "Interpretar com IA" (agora automático); adicionar badges de status novos.
- `src/routes/_authenticated/super-admin.customizations.tsx` — nova fila de super-admin.
- `src/components/app/testing-banner.tsx` — banner sticky de teste em curso.
- `src/components/app/app-shell.tsx` — montar `TestingBanner` + esconder/exibir item "Super admin" no menu.
- `src/hooks/use-super-admin.ts` — hook `useIsSuperAdmin()`.
- `src/hooks/use-active-test.ts` — hook que retorna pedido em `testing` do workspace atual.

---

## Detalhes técnicos relevantes

- IA: `google/gemini-3-flash-preview` via Lovable AI Gateway (`createLovableAiGatewayProvider`), com `Output.object` (Zod schema) — sem texto livre, só JSON.
- Consumo de créditos: continua descontando ao **aplicar** (auto ou via admin), não ao enviar.
- Rollback é determinístico: cada `action.type` suportado tem inverso registrado em `rollback_payload` no momento da aplicação.
- Para `advanced`, a IA não tenta executar — só descreve. O super-admin decide manualmente (por enquanto a "aplicação" do super-admin grava um registro genérico em `customizations` apontando para o pedido; mudanças avançadas reais ainda exigem você fazer pelo Lovable editor, mas o fluxo de aprovação/teste funciona).
- Constraint: índice parcial `UNIQUE (workspace_id) WHERE status = 'testing'`.

---

## Fora do escopo desta entrega

- Aplicar mudanças "avançadas" de verdade (paleta, novas features) automaticamente — só o **fluxo de aprovação** delas. A execução real continua manual via Lovable.
- Notificações por email ao super-admin (pode ser adicionado depois).

Confirma que posso seguir com esse plano?
