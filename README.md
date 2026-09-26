# AloEditor 🎬⚡

> **Editor de Vídeo Web Client-Side com Integração Direta ao Google Drive**  
> Inspirado na agilidade do CapCut, porém rodando **100% no navegador** com **0 MB de arquivos baixados para o disco local** e **custo zero de servidores de renderização**.

---

## 🚀 Destaques da Arquitetura

1. **Zero Download Local / Streaming sob Demanda**: Os vídeos permanecem no Google Drive do usuário e são consumidos em tempo real via **HTTP Range Requests (206 Partial Content)**.
2. **Projetos Salvos no Próprio Drive**: Cada edição gera um arquivo `.json` leve armazenado diretamente na pasta `/AloEditor/Projetos` do Drive do usuário. Custo zero de banco de dados.
3. **Renderização Acelerada por GPU (Client-Side)**: A exportação de vídeo roda na máquina do usuário através da **WebCodecs API** e MP4 Muxer (ou WebAssembly FFmpeg), sem filas em servidores em nuvem.
4. **Interface Estilo CapCut**: Visual Dark Mode com paleta refinada, timeline multitrack interativa, scrubbing em tempo real, painel de propriedades e inspetor contextual.

---

## 📁 Estrutura do Monorepo

```
AloEditor/
├── apps/
│   ├── web/                     # Frontend Next.js (App Router, React 19, Vanilla CSS)
│   │   ├── src/
│   │   │   ├── app/             # Rotas e Layout principal
│   │   │   ├── components/
│   │   │   │   ├── Header/      # Barra superior, proporções (16:9, 9:16), status Drive
│   │   │   │   ├── Sidebar/     # Painel de Mídia, Áudio, Texto, Efeitos e Transições
│   │   │   │   ├── Player/      # Canvas/Player de preview, controles de corte e scrubbing
│   │   │   │   ├── Inspector/   # Inspetor de Transform, Cores/Filtros, Áudio, Velocidade e Texto
│   │   │   │   ├── Timeline/    # Linha do tempo multitrack, régua, agulha (playhead) e clips
│   │   │   │   └── Modals/      # Google Picker, Exportador Client-Side, Atalhos de Teclado
│   │   │   ├── context/         # EditorContext (estado global, histórico undo/redo, timeline loop)
│   │   │   ├── data/            # Mídias e projetos de amostra para teste imediato
│   │   │   └── types/           # Definições completas do motor de edição
│   └── api/                     # Backend NestJS (TypeScript, pronto para expansão)
├── package.json                 # Scripts raiz do monorepo
└── .gitignore
```

---

## 🛠️ Comandos de Desenvolvimento

### 1. Iniciar o Frontend (Next.js)
```bash
npm run dev:web
```
Acesse em: **[http://localhost:3001](http://localhost:3001)**

### 2. Iniciar o Backend (NestJS)
```bash
npm run dev:api
```

### 3. Build de Produção
```bash
npm run build:web
npm run build:api
```

---

## ⌨️ Principais Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| <kbd>Espaço</kbd> | Reproduzir / Pausar |
| <kbd>S</kbd> | Dividir clipe no playhead (Split) |
| <kbd>Del</kbd> / <kbd>Backspace</kbd> | Excluir clipe selecionado |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Desfazer (Undo) |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Refazer (Redo) |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | Duplicar clipe selecionado |
