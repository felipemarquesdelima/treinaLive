# TreinaLive

TreinaLive é um protótipo de plataforma web para treinamentos online. O projeto roda com um servidor HTTP feito em Java puro, sem dependências externas, e usa HTML, CSS e JavaScript no frontend.

A aplicação permite criar salas ao vivo, transmitir câmera, microfone ou tela, gravar aulas pelo navegador e enviar materiais de apoio para alunos autenticados.

## Funcionalidades

- Login com perfis de `mestre`, `administrador` e `aluno`.
- Salas ao vivo com sinalização WebRTC entre host e alunos.
- Transmissão de webcam, microfone e compartilhamento de tela.
- Gravação da aula pelo navegador usando `MediaRecorder`.
- Envio de materiais de apoio por contas `mestre` e `administrador`.
- Biblioteca de aulas gravadas por título.
- Download de aulas gravadas e materiais de apoio.
- Aba para gerenciar usuários em contas com permissão.
- Armazenamento local das gravações e materiais na pasta `uploads`.

## Tecnologias

- Java com `com.sun.net.httpserver.HttpServer`.
- HTML, CSS e JavaScript puro.
- WebRTC para transmissão ao vivo.
- MediaRecorder API para gravação no navegador.
- Docker opcional para empacotar e executar a aplicação.

## Estrutura do Projeto

```text
treinaLive/
├── src/
│   └── App.java          # Servidor HTTP, autenticação, APIs e sinalização WebRTC
├── public/
│   ├── index.html        # Interface web
│   ├── app.js            # Lógica do frontend
│   └── styles.css        # Estilos da aplicação
├── uploads/              # Gravações, materiais e metadados locais
├── bin/                  # Classes Java compiladas
├── Dockerfile            # Imagem Docker da aplicação
└── README.md
```

## Requisitos

Para rodar localmente:

- JDK instalado. O projeto funciona com Java 21 ou superior.
- Navegador moderno com suporte a WebRTC e MediaRecorder.
- Permissão do navegador para câmera, microfone e compartilhamento de tela.

Para rodar com Docker:

- Docker instalado.

## Como Inicializar Localmente

Abra o terminal na raiz do projeto e compile a aplicação:

```powershell
New-Item -ItemType Directory -Force bin | Out-Null
javac -encoding UTF-8 -d bin src/App.java
```

Depois inicie o servidor:

```powershell
java -cp bin App
```

A aplicação ficará disponível em:

```text
http://localhost:8080
```

Se quiser usar outra porta, defina a variável `PORT` antes de iniciar:

```powershell
$env:PORT = "8081"
java -cp bin App
```

## Como Inicializar com Docker

Construa a imagem:

```powershell
docker build -t treinalive .
```

Execute o container:

```powershell
docker run --rm -p 8080:8080 -v ${PWD}/uploads:/app/uploads treinalive
```

Depois acesse:

```text
http://localhost:8080
```

O volume `-v ${PWD}/uploads:/app/uploads` mantém gravações e materiais salvos na pasta `uploads` do projeto mesmo depois que o container for encerrado.

## Contas de Teste

| Perfil | Usuário | Senha | Permissões |
| --- | --- | --- | --- |
| Mestre | `mestre` | `mestre123` | Acessa aulas, grava, compartilha tela, envia materiais e gerencia usuários. |
| Administrador | `admin` | `admin123` | Acessa aulas como host, grava, compartilha tela, envia materiais e cria alunos. |
| Aluno | `aluno` | `aluno123` | Entra nas salas, assiste aulas e baixa arquivos. |

As contas são criadas em memória quando o servidor inicia.

## Como Testar uma Aula ao Vivo

1. Abra `http://localhost:8080` em duas abas ou em dois navegadores.
2. Em uma aba, entre como host usando `mestre` ou `admin`.
3. Na outra aba, entre como aluno usando `aluno`.
4. Use o mesmo nome de sala nas duas sessões, por exemplo `sala-principal`.
5. No host, permita o uso de câmera e microfone.
6. Use a opção de espelhar tela se quiser transmitir a tela do computador.
7. Clique em gravar aula para iniciar a gravação.
8. Pare a gravação para salvar o arquivo na biblioteca de aulas.

## Uploads e Arquivos Gerados

Os uploads da aplicação ficam em:

```text
uploads/
```

Essa pasta pode conter:

- vídeos gerados pela gravação da aula no navegador;
- materiais enviados pelo host;
- `recordings.tsv`, com metadados das gravações;
- `materials.tsv`, com metadados dos materiais.

O envio de materiais fica disponível apenas para contas `mestre` e `administrador`. Contas `aluno` podem assistir aulas e baixar arquivos, mas não podem enviar materiais.

As salas, sessões ativas, tokens de login e usuários criados durante a execução ficam em memória. Ao reiniciar o servidor, esses dados temporários são perdidos. Os itens em `uploads` continuam salvos.

## Rotas Principais da API

| Rota | Descrição |
| --- | --- |
| `POST /api/auth/login` | Autentica usuário e cria sessão. |
| `GET /api/auth/me` | Retorna o usuário autenticado. |
| `POST /api/auth/logout` | Encerra sessão. |
| `GET /api/users` | Lista usuários para perfis autorizados. |
| `POST /api/users` | Cria usuários. |
| `DELETE /api/users` | Remove usuários. |
| `GET /api/rooms` | Lista salas ativas. |
| `POST /api/session/join` | Entra em uma sala. |
| `GET /api/session/poll` | Busca eventos de sinalização. |
| `POST /api/session/signal` | Envia eventos WebRTC. |
| `POST /api/session/leave` | Sai de uma sala. |
| `GET /api/lessons` | Lista aulas gravadas. |
| `GET /api/materials` | Lista materiais. |
| `POST /api/upload` | Salva gravações feitas pelo navegador e envia materiais para perfis autorizados. |
| `GET /download` | Baixa uma gravação ou material. |

## Observações Importantes

- O projeto é um protótipo e usa autenticação simples em memória.
- Para uso em produção, use HTTPS, autenticação persistente, banco de dados e armazenamento de arquivos adequado.
- WebRTC pode exigir um servidor TURN em redes restritivas.
- Para muitos alunos simultâneos, o ideal é evoluir de conexão peer-to-peer para uma SFU, como mediasoup, Janus ou LiveKit.
