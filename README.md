# money

Controle de orçamento pessoal em PWA offline-first: envelopes por categoria,
projeção de parcelas de cartão e cálculo de quanto dá para gastar hoje sem
apertar o mês.

O nome e a identidade visual vêm de *The Dark Side of the Moon* (Pink Floyd,
1973): o feixe branco é a renda, e o espectro são as categorias em que ela se
divide. Cor no app significa sempre categoria — o resto da interface é
monocromático de propósito.

## Como o cálculo funciona

```
renda líquida
 − contas fixas e assinaturas
 − parcelas de cartão que caem no mês
 − meta de poupança            ← tratada como despesa fixa, não como sobra
 = dinheiro variável do mês    → repartido em envelopes por categoria

sobra de hoje = (envelope do mês − já gasto) ÷ dias restantes
```

Três decisões que diferenciam isto de um diário de gastos:

1. **Poupança sai do topo.** Guardar o que sobra no fim do mês quase nunca
   funciona; sobra menos do que se planeja.
2. **Fixos e parcelas não são lançados.** Já estão descontados, então você só
   registra gasto variável — menos toques, e sem risco de contar duas vezes.
3. **Parcela compromete o futuro.** A tela Plano projeta 12 meses e simula o
   impacto de um parcelamento *antes* de você confirmá-lo.

A proposta automática de envelopes parte da referência 50/30/20, desconta o que
cada balde já gasta em fixos, e garante um piso de 55% do variável para o
essencial — sem esse piso, custo fixo alto faz a régua sugerir mais dinheiro
para saídas do que para mercado.

## Estrutura

| Caminho | O que é |
| --- | --- |
| `docs/` | o app — raiz do GitHub Pages e `webDir` do Capacitor |
| `docs/js/budget.js` | motor financeiro, puro: sem DOM, sem rede |
| `docs/js/store.js` | estado, localStorage e mesclagem entre aparelhos |
| `docs/js/sync-github.js` | sincronização via Contents API |
| `docs/js/ui.js` | tudo que toca o DOM |
| `scripts/teste-fluxo.mjs` | sobe o app em DOM simulado e percorre o fluxo inteiro |
| `scripts/make-icons.mjs` | desenha o prisma em pixels e gera os PNGs |

```bash
npm install
npm test        # teste de fluxo
npm run servir  # http://localhost:8080
npm run icones  # regera os ícones
```

## Sincronização

Os dados **não** ficam neste repositório. Eles vão para um repositório privado
separado (`money-data`), num único `dados.json`, gravado pela Contents API do
GitHub com um token *fine-grained* guardado apenas no aparelho.

Cada item carrega `id` e `updatedAt`, e apagar escreve uma lápide em vez de
remover. Assim celular e PC se mesclam item a item: editar os dois no mesmo dia
resolve só o item em conflito pela alteração mais recente, sem um sobrescrever o
outro por inteiro.

O token nunca entra no estado sincronizado e só é enviado para `api.github.com`.
Use um token limitado ao repositório de dados, com `Contents: Read and write` —
se vazar, o estrago para aí.

## Publicar

1. `git remote add origin git@github.com:SEU-USUARIO/money.git && git push -u origin main`
2. No repositório: **Settings → Pages → Source: `main` / pasta `/docs`**
3. Abra a URL no celular → menu do Chrome → **Instalar aplicativo**
4. No app: **Ajustes → Sincronização**, informe `SEU-USUARIO/money-data` e o token

## Virar APK

`docs/` já é o `webDir`. Numa máquina com Android Studio:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init money com.seudominio.money --web-dir=docs
npx cap add android
npx cap sync && npx cap open android
```
