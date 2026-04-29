# TreinaLive

Protótipo Java de uma plataforma web para treinamentos online com:

- sala WebRTC entre host e alunos;
- servidor Java de sinalizacao com salas e participantes em memoria;
- autenticacao com contas `mestre`, `administrador` e `aluno`;
- webcam, microfone e compartilhamento de tela;
- gravacao da aula em `.webm` direto pelo navegador;
- biblioteca de aulas gravadas por titulo para rever depois;
- upload de aulas gravadas e materiais pelo host;
- listagem e download de arquivos para os alunos;
- servidor HTTP local sem dependências externas.

## Como executar

Compile e execute a aplicação:

```powershell
javac -d bin src/App.java
java -cp bin App
```

Depois acesse:

```text
http://localhost:8080
```

Os arquivos enviados ficam na pasta `uploads`.

## Como testar o WebRTC

1. Abra `http://localhost:8080` em duas abas ou dois navegadores.
2. Entre com uma conta host: usuario `mestre`, senha `mestre123`, ou usuario `admin`, senha `admin123`.
3. Em outra aba, entre como aluno: usuario `aluno`, senha `aluno123`.
4. Use a mesma sala, por exemplo `sala-principal`.
5. Permita o acesso a camera e microfone no host.
6. No host, use `Espelhar tela` para transmitir a tela do computador.
7. Defina o nome da aula, por exemplo `Aula 1 - Treinamento anestesia`.
8. Use `Gravar aula` para iniciar/parar a gravacao; ao parar, ela aparece em `Aulas gravadas` com player e download.

## Niveis de conta

- `mestre`: pode acessar aula, gravar, espelhar tela, enviar arquivos e gerenciar usuarios.
- `administrador`: pode acessar aula como host, gravar, espelhar tela, enviar arquivos e criar alunos.
- `aluno`: pode entrar na sala para visualizar a aula e baixar arquivos.

O Java guarda as salas em memoria. Ao reiniciar o servidor, as conexoes ativas sao perdidas, mas os arquivos em `uploads` continuam salvos.

## Próximos passos para produção

Para producao, substitua a autenticacao simples por login real, use HTTPS, persista salas em banco de dados e adicione um TURN server para redes restritivas. Para muitos alunos simultaneos, o ideal e evoluir de malha peer-to-peer para SFU, como mediasoup, Janus ou LiveKit.
