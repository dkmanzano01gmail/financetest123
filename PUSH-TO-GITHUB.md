# Enviar esta versão ao GitHub/Lovable

O repositório conectado é:

`https://github.com/dkmanzano01gmail/financetest123.git`

## Opção recomendada — terminal no Mac

1. Extraia o ZIP baixado do ChatGPT.
2. Abra o Terminal e execute, ajustando apenas o caminho da pasta extraída quando necessário:

```bash
cd ~
rm -rf financetest123-sync
git clone https://github.com/dkmanzano01gmail/financetest123.git financetest123-sync
rsync -av --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='node_modules' \
  ~/Downloads/financetest123-appscript-parity/ financetest123-sync/
cd financetest123-sync
npm ci
npm run build
git add .
git commit -m "Replica logicas do Apps Script da Orna"
git push origin main
```

Se o ZIP tiver sido extraído em outro local, substitua `~/Downloads/financetest123-appscript-parity/` pelo caminho correto.

## Banco de dados

O código depende da migration:

`supabase/migrations/20260726030000_apps_script_logic_parity.sql`

Confira se ela foi aplicada no banco Supabase/Lovable antes de usar as telas. O arquivo é idempotente e preserva dados existentes.

## Depois do push

A conexão Git da Lovable sincronizará a branch `main`. Para atualizar o endereço publicado, abra o projeto e use **Publish → Update** quando a nova versão aparecer.
