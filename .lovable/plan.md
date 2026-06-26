# Plano — Personalizações com efeito visual real

## Causa raiz

1. `useLabelOverrides` carrega TODAS as customizações `label_rename` ativas e mescla via `Object.assign` sem ordenação determinística. Quando existe uma antiga ("Dashboard NEW") + uma em teste ("Dashboard") para a mesma chave `nav.dashboard`, qual vence é loteria.
2. `applyAndPersist` insere uma NOVA customização `is_active=true` toda vez, sem desativar conflitos prévios do mesmo `menu_key`. Resultado: duas linhas ativas competindo.
3. Não existe distinção entre customização "em teste" e "aceita pelo usuário". Não há campo de prioridade ou estado de candidata.
4. O parser regex de rename só captura padrões simples (`X para Y`) e não trata "voltar X para Y" / "ao invés de". Quando falha, cai no fallback `advanced` e nem aplica.
5. `customization_requests.status='approved'` antigos foram backfillados como `is_active=true`, então mesmo rejeitando o teste, a antiga continua dominando.
6. Sidebar e PageHeader usam labels resolvidas no momento do render, mas sem invalidação automática após approve/reject (depende de `window.location.reload`).

## O que vou mudar

### 1. Schema — distinguir teste vs. aceita
Migration adicionando:
- `customizations.menu_key text` (gerado/preenchido para `label_rename`: a chave única dentro de `configuration_json.labels`).
- `customizations.is_testing boolean default false` — true enquanto o request associado está em `testing`.
- Índice único parcial: `(workspace_id, type, menu_key) WHERE is_active AND NOT is_testing AND type='label_rename'` — garante uma só ativa-definitiva por chave.
- Backfill: preencher `menu_key` para linhas existentes a partir da primeira chave de `configuration_json.labels`.

### 2. Aplicação com prioridade correta
Em `applyAndPersist` (label_rename easy):
- Calcular `menu_key` do payload.
- Antes de inserir, NÃO desativar a anterior — ela continua ativa como fallback caso rejeitem.
- Inserir nova com `is_active=true, is_testing=true, menu_key=<chave>`.
- Request fica `status='testing'`.

Em `user_approve_test` (RPC):
- Achar a customização do request.
- Marcar `is_testing=false` (vira definitiva).
- Desativar (`is_active=false`) outras customizações `label_rename` do mesmo `workspace_id + menu_key` (exceto a nova).

Em `user_reject_test` (RPC, já remove a nova):
- A anterior continua `is_active=true, is_testing=false` → sidebar volta sozinha.

### 3. Hook único com precedência
Reescrever `useLabelOverrides`:
- Buscar todas as label_rename ativas ordenadas por `is_testing DESC, updated_at DESC`.
- Agrupar por `menu_key` → primeira ganha → testing sempre vence definitiva.
- Expor `getMenuLabel(key, default)` para consumo. Sidebar e `page-header` usam essa API.
- Adicionar invalidação via `qc.invalidateQueries(["label-overrides", workspaceId])` no `TestingBanner` (approve/reject) — remover `window.location.reload`.

### 4. Parser mais robusto
Reescrever `classifyLocally` para rename:
- Primeiro tentar achar uma palavra-chave de NAV no texto (dashboard, contas, transações, …) → define `menu_key` sem depender de regex posicional.
- Em seguida extrair o "novo nome" via:
  - `para "X"` / `para X`
  - `chamar de X`
  - `ao invés de Y` → menu_key vem de Y se mais específico
  - "voltar (o nome )?para X" → ainda determina menu_key pela ocorrência de palavra-chave nav.
- Se achou menu_key + novo nome → easy `label_rename` com `{ labels: { [key]: newName } }`.
- Atualizar o SYSTEM_PROMPT da IA reforçando: "se o pedido menciona dashboard, a chave é sempre `nav.dashboard` mesmo que label atual seja outra".

### 5. Status humanizados
Em `customizations.tsx` mapear:
- `testing` → "Em teste"
- `approved` → "Aplicada" (e renomear a label exibida — manter status DB como `approved`)
- `needs_admin_review` → "Em análise"
- `rejected`/`rejected_by_admin` → "Rejeitada"
- `waiting_credits` → "Aguardando créditos"

### 6. Rotina de reparo
Atualizar `reprocessPendingRequests`:
- Após reprocessar, executar limpeza global: para cada `(workspace_id, menu_key)` com mais de uma ativa não-testing, manter só a mais recente.
- Recalcular `menu_key` para linhas antigas baseadas no payload.

### 7. Erros Supabase RPC
Auditar `rg "\.rpc\([^)]*\)\.catch"` no projeto. Onde encontrar, substituir por `try { const { error } = await supabase.rpc(...); if (error) throw error; } catch (e) {...}`. Já está OK no `customizations.functions.ts`; verificar UI.

## Arquivos afetados
- `supabase/migrations/...sql` (novo): coluna `menu_key`, `is_testing`, índice, backfill; ajuste das RPCs `user_approve_test` / `user_reject_test`.
- `src/lib/customizations.functions.ts`: parser, `applyAndPersist`, reprocess.
- `src/hooks/use-label-overrides.ts`: precedência testing > active.
- `src/components/app/testing-banner.tsx`: trocar `window.location.reload` por invalidate.
- `src/components/app/app-shell.tsx`: já usa `applyLabel`, só validar.
- `src/routes/_authenticated/customizations.tsx`: status humanizados + botão "Reprocessar" (já existe — manter).
- `src/components/app/page-header.tsx` (opcional): nada a mudar — labels de página vêm dos componentes que já usam o hook.

## Validação
1. Pedir "renomear Dashboard para Dashboard NEW" → banner aparece → sidebar mostra "Dashboard NEW" sem refresh manual → aprovar → permanece.
2. Pedir "voltar nome para Dashboard ao invés de Dashboard NEW" → banner aparece → sidebar mostra "Dashboard" → aprovar → antiga é desativada.
3. Mesmo cenário porém rejeitar → sidebar volta para "Dashboard NEW".
4. Rodar "Reprocessar pedidos pendentes" → conflitos antigos resolvidos para uma ativa por menu_key.

Pronto para implementar?
