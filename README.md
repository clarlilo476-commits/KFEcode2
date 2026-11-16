# KFEcode — GitHub Pages

Pacote estático pronto para publicar, sem instalação de Node.js ou npm.

## Publicar

1. Extraia o ZIP e envie seu conteúdo para a raiz do repositório. O `index.html` deve aparecer na primeira tela do repositório, junto de `assets/`.
2. Abra **Settings → Pages → Source → Deploy from a branch**.
3. Selecione **main** (ou a branch usada), **/(root)** e **Save**.
4. Aguarde a publicação e abra o endereço indicado pelo GitHub.

Se estiver atualizando a versão anterior, remova somente os arquivos antigos do KFEcode que este pacote substitui: `dist/`, `local/`, `.openai/`, `vendor.mjs`, `package.json`, `package-lock.json` e `.github/workflows/pages.yml`. Preserve arquivos de outros projetos e outros workflows. Desative o workflow antigo antes de enviar esta versão, pois ele procurava a pasta `dist`. Faça a mudança da fonte de publicação para **Deploy from a branch**.

## Conteúdo

- `index.html`: página inicial.
- `assets/`: código do aplicativo, estilos, ícone, fontes e bibliotecas necessárias.
- `.nojekyll`: configuração de publicação estática; envie também este arquivo.
- `README.md`: este guia.
- `.devcontainer/devcontainer.json`: perfil opcional do Codespaces com Python e Pyrefly.

Os arquivos de bibliotecas e suas licenças foram mantidos. Não apague `assets/vendor`: ela fornece edição, autocomplete, análise de JavaScript, formatação, refatoração, ZIP e modos de teclado. Recursos são carregados conforme utilizados. Não é necessário instalar dependências nem configurar um workflow próprio.

## Uso

Use **+** no Explorador para criar ou importar projetos, arquivos e pastas. **Ctrl+F** busca no arquivo; **Ctrl+Shift+F**, no projeto; **Atalhos**, na barra superior, reúne os comandos. **Executar** abre a prévia de HTML, CSS e JavaScript. As configurações incluem os temas macOS e os demais temas do KFEcode.

O workspace fica neste navegador (IndexedDB), sem sincronização automática com o repositório GitHub. Exporte seus projetos como ZIP para guardar uma cópia; limpar os dados do site pode apagar o workspace.

GitHub Pages hospeda os arquivos estáticos. O editor web inclui console da prévia, terminal com comandos de leitura do workspace, diff, versões do workspace e auditoria básica de HTML e JavaScript. Shell do sistema, Git com push/pull, depuração Node.js e remota, executores de testes, instalação de dependências e extensões executáveis do VS Code exigem um ambiente de execução separado. O importador VSIX suporta contribuições compatíveis de temas, snippets e atalhos. O catálogo usa Open VSX.

## Extensões do VS Code no GitHub

1. Coloque `.devcontainer/devcontainer.json` na raiz do repositório que contém seu código Python, mantendo o caminho `.devcontainer/devcontainer.json`. Se o projeto já tem um dev container, adicione `meta.pyrefly` à lista `customizations.vscode.extensions` existente.
2. No KFEcode, abra **Extensões → Abrir no GitHub Codespaces** e informe o endereço do repositório. O GitHub abrirá a tela para criar ou retomar um Codespace no VS Code pelo navegador. Também é possível usar **Code → Codespaces** no próprio repositório.
3. Abra um arquivo `.py`. Em um Codespace existente, use **Codespaces: Rebuild Container** para aplicar o perfil novo ou instale **Pyrefly - Python Language Tooling** no painel de extensões do VS Code. O Codespaces instala a versão do Pyrefly para o ambiente remoto. O arquivo VSIX `win32-x64` é para Windows.

O Codespaces usa a cota da sua conta. O editor aberto tem a interface do VS Code. Arquivos que existem só no workspace do KFEcode precisam ser exportados e enviados ao repositório antes que o Codespace possa acessá-los.

## Plugins do KFEcode

Em **Extensões**, baixe o **Manifesto de exemplo** e importe esse JSON. Abra um arquivo HTML e, com o cursor onde você quer inserir o código, clique em **Inserir seção HTML** no cartão do plugin. O botão insere o código no editor sem pedir atalho. O mesmo manifesto oferece o snippet `secao-kfe` por meio das sugestões de HTML.

Autores podem usar `kfecode.commands` com `label`, `action: "insertText"`, `text` e, opcionalmente, `language` para restringir a ação à linguagem do arquivo. O editor insere o texto quando o usuário clica no comando. O manifesto não pode executar JavaScript com acesso à IDE. Se um VSIX trouxer apenas recursos que dependem do host VS Code, o KFEcode explica o motivo e não o lista como instalado.

Documentação: [GitHub Codespaces](https://docs.github.com/pt/codespaces/quickstart) e [Pyrefly na IDE](https://pyrefly.org/en/docs/IDE/).

## Identidade visual

O tema **Azul Noturno** combina superfícies de grafite e azul escuro com uma janela de cantos arredondados e controles inspirados no macOS. As referências guiaram o contraste, o brilho discreto e o uso de laranja na prévia de exemplo. As cores são escolhas para o KFEcode.

| Uso | Cores do Azul Noturno |
| --- | --- |
| Fundo externo e luz de fundo | `#090C11`, `#1B2F49` |
| Janela, barra de ferramentas e trilho | `#10141B`, `#191E27`, `#101319` |
| Explorador, editor e painel inferior | `#151A22`, `#12161D`, `#11151C` |
| Campos, hover e seleção | `#1B222C`, `#222A36`, `#21344C` |
| Bordas, separadores e contorno externo | `#2B3441`, `#313C4C`, `#3A4656` |
| Texto, texto secundário e rótulos discretos | `#E2E8F0`, `#BAC5D3`, `#8D9AAD` |
| Destaque, foco e brilho | `#8FBCFA`, `#78ADF3`, `#438AE3` |
| Sucesso, atenção e erro | `#83C9A6`, `#EEB082`, `#ED9091` |
| Ícones de HTML, CSS e JavaScript | `#FF925D`, `#75A6FF`, `#F6D26A` |

- **Tipografia.** Fonte de sistema no macOS, Inter como alternativa. Interface de 13 px com altura de linha de 1,45, títulos de painel de 12 px, marca de 18 px com peso 720. Código em JetBrains Mono de 13 px com altura de linha de 22 px por padrão.
- **Contornos.** Bordas de 1 px, raio de 16 px na janela, 13 px em diálogos, 10 px em menus e 7 px em abas.
- **Sombras.** Janela com `0 18px 54px #00000080, 0 2px 8px #00000055`. Menus com `0 10px 32px #00000055`.
- **Movimento.** Linha de luz com ciclo alternado de 14 s, desativada com a preferência de movimento reduzido do sistema.
- **Ilustrações.** Ícones lineares e marca vetorial. A órbita da prévia de exemplo usa CSS. O editor dispensa imagens decorativas.

Os valores exatos dos outros temas ficam em `assets/app.css` (interface) e `assets/editor.js` (editor e sintaxe).

Documentação da publicação: https://docs.github.com/pt/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
