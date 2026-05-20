# Bolão da Copa 2026 — Thymos Energia

App de palpites para a Copa do Mundo 2026. Login seguro por usuário/senha
(Firebase Authentication), palpite por jogo com travamento no horário da
partida, calendário, ranking, palpite de campeão/vice com multiplicador por
fase, importação automática dos jogos da FIFA e painel admin completo.

Stack: HTML + JS modular + Firebase (Authentication + Realtime Database).
Sem build, sem backend próprio — roda no GitHub Pages.

## Setup (uma vez)

### 1. Criar projeto Firebase

1. Acesse https://console.firebase.google.com/ -> "Adicionar projeto".
2. Escolha um nome, siga o assistente (pode desativar o Analytics).

### 2. Ativar o Authentication

1. Menu lateral -> "Criação" -> "Authentication" -> "Vamos começar".
2. Aba "Sign-in method" -> clique em "E-mail/senha" -> ative a primeira
   chave (E-mail/senha) -> "Salvar". (NÃO precisa ativar link por e-mail.)

### 3. Criar o Realtime Database

1. Menu lateral -> "Criação" -> "Realtime Database" -> "Criar banco de dados".
2. Escolha a região e o modo de teste (as regras certas vêm no passo 6).
3. Anote o endereço do banco que aparece no topo (algo como
   `https://SEU-PROJETO-default-rtdb.firebaseio.com`).

### 4. Pegar as credenciais e configurar o app

1. Project Overview -> ícone web `</>` -> registre um app web.
2. Copie o objeto `firebaseConfig` e cole os valores em `js/firebase-config.js`.
3. Confira que a linha `databaseURL` tem o endereço real do passo 3.

### 5. Importar a estrutura inicial

No Realtime Database -> três pontinhos da raiz -> "Importar JSON" ->
importe `database-seed.json` (cria config, scoringRules, tournamentResult).

### 6. Aplicar as regras de segurança

No Realtime Database -> aba "Regras" -> apague tudo -> cole o conteúdo do
arquivo `database-rules.json` -> "Publicar".

Essas regras são fechadas: só usuários logados leem os dados, cada
participante só edita os próprios palpites, e apenas o admin altera jogos,
resultados e configurações. O aviso de "banco público" do Firebase some.

### 7. Publicar no GitHub Pages

Suba o conteúdo da pasta (com o `firebase-config.js` já preenchido) para um
repositório e ative em Settings -> Pages -> Branch: main / (root).
O `index.html` precisa ficar na RAIZ do repositório.

### 8. Criar o administrador

O admin é criado como um participante normal e depois promovido:

1. Abra o app publicado e clique em "Cadastrar". Crie a SUA conta
   (nome, usuário, e-mail `@thymosenergia.com.br`, senha).
2. No Firebase Console -> Authentication -> aba "Users", confirme que sua
   conta apareceu. Copie o "UID do usuário" (botão de copiar ao lado do UID).
3. No Realtime Database, navegue até `users` -> abra o nó com o seu UID.
4. Nesse nó, mude o campo `role` de `user` para `admin`
   (clique no valor "user", troque para "admin", Enter).
5. Pronto. Agora você acessa `admin.html` com seu usuário e senha.

> Esse é o único passo manual no banco — promover o primeiro admin. Depois
> disso, tudo é feito pelos painéis do app.

## Uso

### Participante

1. Acesse o app, clique em "Cadastrar" (e-mail `@thymosenergia.com.br`).
2. Aba "Palpites": digite os placares (salvam sozinhos como rascunho).
3. Clique em "Enviar palpite" para travar antes do jogo. Se não enviar
   até o horário da partida, o último rascunho vira o palpite final.
4. Aba "Campeão": escolha campeão e vice. Vale 1x até 1 dia antes da Copa,
   1/2x se alterado durante a fase de grupos, 1/3x se alterado entre os
   16-avos e as quartas, bloqueado depois.
5. Esqueceu a senha? Botão "Esqueci minha senha" na tela de login — chega
   um link de redefinição no seu e-mail corporativo.

### Admin (admin.html)

- **Usuários**: renomear, enviar e-mail de redefinição de senha, remover.
- **Jogos**: importar os 104 jogos da FIFA com um clique, adicionar manual
  ou em lote (JSON).
- **Resultados**: sincronizar placares da FIFA ou lançar manualmente.
- **Pontuação**: ajustar os pontos de cada categoria.
- **Configurações**: datas das fases e domínios de e-mail aceitos.

#### Sobre senhas no novo modelo

Com o Firebase Authentication, as senhas são gerenciadas pelo Google e não
ficam no banco. Por isso o admin não digita a senha de ninguém — em vez
disso, usa "Enviar reset de senha" e o participante define a nova senha pelo
link que recebe por e-mail. Mais seguro e autoatendido.

Para apagar uma conta por completo: remover pelo painel apaga o perfil e os
palpites; a conta de login em si é apagada no Firebase Console
(Authentication -> Users -> excluir).

## Estrutura

```
bolao-copa-2026/
├── index.html              # App principal (login + 4 abas)
├── admin.html              # Painel admin
├── css/style.css           # Estilos
├── js/
│   ├── firebase-config.js  # Suas credenciais (preencher)
│   ├── auth.js             # Login/cadastro via Firebase Authentication
│   ├── fixture.js          # Estágios, seleções, helpers de data
│   ├── fifa-sync.js        # Importação de jogos/resultados da FIFA
│   ├── scoring.js          # Motor de pontuação + ranking
│   ├── app.js              # Lógica do app (usuário)
│   └── admin.js            # Lógica do painel admin
├── database-seed.json      # Estrutura inicial do banco
├── database-rules.json     # Regras de segurança do Firebase
└── README.md
```

## Pontuação

| Categoria | Pontos | Observação |
|-|-:|-|
| Acertou o vencedor (ou empate) | 2 | |
| Placar exato | 3 | |
| Acertou os gols de um time | 1 | Só se NÃO acertou ambos |
| Diferença de gols | 1 | Só se acertou o vencedor e não foi placar exato |
| Campeão | 20 × multiplicador | |
| Vice-campeão | 20 × multiplicador | |

Multiplicador do palpite de campeão/vice: 1x antes da Copa, 1/2x se alterado
na fase de grupos, 1/3x se alterado entre 16-avos e quartas, bloqueado depois.
Pontos são cumulativos. Desempate no ranking: pontos -> placares exatos ->
vencedores acertados -> ordem alfabética.
