# Bolão da Copa 2026 — Thymos Energia

App de palpites para a Copa do Mundo 2026. Login por usuário/senha, palpite por jogo, travamento no horário do jogo, calendário, ranking, palpite de campeão/vice com multiplicador por fase, e painel admin completo.

Stack: HTML + JS modular + Firebase Realtime Database. Sem build, sem backend, sem dependências de pacote — pronto para GitHub Pages.

## Setup (uma vez)

### 1. Criar projeto Firebase

1. Acesse https://console.firebase.google.com/ e clique em **Adicionar projeto**.
2. Escolha um nome (ex: `bolao-copa-thymos`), siga o assistente. Pode desativar o Analytics.
3. Dentro do projeto, vá em **Build → Realtime Database → Criar banco**. Escolha a região (us-central funciona) e o **modo de teste** (vamos trocar pelas regras certas depois).
4. Ainda em Project Overview, clique no ícone web `</>` e registre um **app web**. Copie o objeto `firebaseConfig` que aparece.

### 2. Configurar o app

1. Clone/baixe este projeto.
2. Abra `js/firebase-config.js` e cole os valores do `firebaseConfig` que você copiou.
3. (Opcional) Ajuste as datas em `TOURNAMENT_CONFIG` se a FIFA mudar algo. Essas datas também podem ser editadas pelo admin pelo painel.

### 3. Popular o banco

1. No Firebase Console → Realtime Database, clique nos três pontinhos da raiz → **Importar JSON**.
2. Importe o arquivo `database-seed.json` (cria `config`, `scoringRules`, `tournamentResult`).

### 4. Criar o admin

1. Abra `setup-admin.html` localmente (clique duplo, ou `python3 -m http.server` e acesse).
2. Preencha nome, usuário (`admin` por padrão), e-mail e **senha**. Clique em "Gerar JSON".
3. Copie o JSON gerado e cole no Realtime Database (mescle com o conteúdo existente — vai criar o nó `users/admin`).

### 5. Aplicar regras de segurança

Vá em **Realtime Database → Regras** e cole:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> **Nota sobre o modelo de segurança**: o app não usa Firebase Auth (que exige login por e-mail) — usamos hash SHA-256 + salt único no client. Para o hash ser verificado, ele precisa ser lido, então as regras precisam permitir leitura. Isso significa que, tecnicamente, alguém que conheça a URL do seu banco poderia baixar os hashes e tentar quebrar senhas fracas via força bruta. Para um bolão fechado entre 5-15 colegas que não vão fazer isso, é OK. Mitigações já aplicadas:
>
> - Senhas com hash SHA-256 + salt único por usuário (não é texto puro)
> - Mínimo de 6 caracteres por senha (recomende mais aos participantes)
> - Cadastro restrito ao domínio `@thymosenergia.com.br`
>
> Se quiser segurança forte, dá pra migrar para Firebase Auth depois (login por e-mail + lookup de username via /usernameToEmail).

### 6. Deploy no GitHub Pages

```bash
git init
git add .
git commit -m "Bolão da Copa 2026"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/bolao-copa-2026.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source: Deploy from branch → Branch: main / (root)**. Aguarde 1-2 min e acesse `https://SEU_USUARIO.github.io/bolao-copa-2026/`.

## Uso

### Como participante

1. Acesse a URL, clique em **Cadastrar** (precisa de e-mail `@thymosenergia.com.br`).
2. Em **Palpites**, digite os placares. Cada edição salva como rascunho automaticamente.
3. Para travar um palpite antes do jogo, clique em **Enviar palpite**.
4. Se não enviar até o horário do jogo, o último rascunho vira o palpite final.
5. Em **Campeão**, escolha o campeão e o vice. Vale **1x** até 1 dia antes da Copa, **1/2x** se alterado durante a fase de grupos, **1/3x** se alterado entre R32 e oitavas, bloqueado depois.

### Como admin

Acesse `admin.html`, logue com a conta admin e:

- **Usuários**: renomear, trocar senha, excluir
- **Jogos**: importe os 104 jogos direto da FIFA com um clique, ou adicione um por um / em lote via JSON
- **Resultados**: sincronize placares direto da FIFA, ou lance manualmente (recalcula pontuação automaticamente)
- **Pontuação**: ajustar os pontos de cada categoria
- **Configurações**: mudar datas das fases e domínios de e-mail aceitos

### Importar jogos da FIFA (recomendado)

Na aba **Jogos**, clique em **"Importar jogos da FIFA"**. O app busca os 104 jogos da Copa 2026 direto da API oficial da FIFA — datas, horários, estádios, seleções e bandeiras, tudo automático. Pode rodar de novo quando quiser: jogos já importados são atualizados sem duplicar (útil quando os classificados do mata-mata forem definidos, já que hoje vêm como "A1", "B2" etc.).

Na aba **Resultados**, o botão **"Sincronizar resultados"** puxa os placares dos jogos encerrados direto da FIFA. Resultados que você corrigir manualmente ficam protegidos e não são sobrescritos pela sincronização.

> A sincronização usa a API pública da FIFA (`api.fifa.com`), que não é documentada oficialmente. Se a FIFA mudar a estrutura durante o torneio, a sincronização pode falhar — nesse caso, o lançamento manual de jogos e resultados continua funcionando normalmente como alternativa.

### Importar jogos em lote via JSON

Na aba **Jogos**, expanda "Importar lote (JSON)" e cole um array como:

```json
[
  {
    "stage": "group",
    "group": "A",
    "team1": "BRA", "team1Name": "Brasil", "team1Flag": "🇧🇷",
    "team2": "CRO", "team2Name": "Croácia", "team2Flag": "🇭🇷",
    "datetime": "2026-06-15T16:00:00-03:00",
    "venue": "Mercedes-Benz Stadium"
  },
  ...
]
```

Estágios válidos: `group`, `r32`, `r16`, `quarters`, `semis`, `third`, `final`.

## Estrutura

```
bolao-copa-2026/
├── index.html              # App principal (login + 4 abas)
├── admin.html              # Painel admin
├── setup-admin.html        # Helper para criar o admin (usar 1x)
├── css/
│   └── style.css           # Estilos
├── js/
│   ├── firebase-config.js  # Suas credenciais (preencher)
│   ├── auth.js             # Hash de senha + sessão
│   ├── fixture.js          # Estágios, seleções padrão, helpers de data
│   ├── fifa-sync.js        # Importação de jogos e resultados da API da FIFA
│   ├── scoring.js          # Motor de pontuação + ranking
│   ├── app.js              # Lógica do app (usuário)
│   └── admin.js            # Lógica do painel admin
├── database-seed.json      # Estrutura inicial do banco
└── README.md
```

## Regras de pontuação (default)

| Categoria | Pontos | Observação |
|-|-:|-|
| Acertou o vencedor (ou empate) | 2 | |
| Placar exato | 3 | |
| Acertou os gols de um time | 1 | Só se NÃO acertou ambos (senão vira placar exato) |
| Diferença de gols | 1 | Só se acertou o vencedor e não foi placar exato |
| Campeão | 20 × multiplicador | |
| Vice-campeão | 20 × multiplicador | |

**Multiplicador do palpite de campeão/vice**:
- 1x: palpite feito antes do início da Copa
- 1/2x: alterado durante a fase de grupos
- 1/3x: alterado entre 16-avos e quartas
- Bloqueado a partir do início das quartas

**Pontos são cumulativos**: palpite 3×1 num jogo que terminou 3×1 dá 2 + 3 + 1 = 6 pontos (vencedor + placar exato + diferença de gols).

**Desempate no ranking**: pontos → placares exatos → vencedores acertados → ordem alfabética.
