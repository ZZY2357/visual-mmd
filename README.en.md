# Visual MMD

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[简体中文](README.md) | English

A purely front-end visual editor for Mermaid: edit diagrams through a structure tree and property forms, with a live canvas preview — no need to learn Mermaid syntax first. The code panel on the left always shows the Mermaid source of the current diagram, and every edit lands in that directly editable source — you pick up the syntax as you go.

![Visual MMD main window: code panel on the left, canvas in the middle, property panel on the right](docs/readme-screenshot.png)

## Why

Mermaid turns text into diagrams, but writing the syntax by hand has a learning curve; typical visual editors hide the source away, so the diagram gets finished and the syntax never sinks in. Visual MMD puts both in one interface: you can start drawing without knowing the syntax, and every click shows you which piece of source it corresponds to — so you learn Mermaid along the way.

## Features

- **Two-panel editing** — the code panel on the left is the single source of truth; the canvas on the right (structure tree + property forms + live preview) stays in two-way sync with it in real time
- **Edit without learning the syntax** — add and remove elements in the structure tree, edit text and shapes in property forms, add nodes and edges from the context menu (link mode: click the start node, then the end node), double-click a node to edit its text right on the canvas
- **Verbatim preservation** — comments, blank lines, formatting habits and syntax that can't be parsed yet are left untouched, byte for byte
- **All 31 Mermaid diagram types** — the core syntax of every type is editable end to end; canvas interaction is tiered by addressability: clickable types support selection, highlighting and inline editing, the rest have the full structure tree + form editing as their entry point
- **Library** — diagrams are saved in your browser's localStorage; create, rename, duplicate and delete, all locally
- **Import / export** — import `.mmd` text files; export `.mmd`, SVG or high-resolution PNG
- **PWA** — installable on desktop and mobile home screens, works offline, updates automatically
- **Bilingual UI** — switch the interface between Chinese and English with one click; follows your browser language on first launch
- **Keyboard friendly** — arrow keys move the selection by screen direction on the canvas, Tab / Enter add a child or a sibling, Delete removes, Ctrl+Z undoes

<details>
<summary>The 31 supported diagram types</summary>

<code>flowchart</code> · <code>sequence</code> · <code>class</code> · <code>mindmap</code> · <code>state</code> · <code>er</code> · <code>gitgraph</code> · <code>timeline</code> · <code>kanban</code> · <code>requirement</code> · <code>journey</code> · <code>pie</code> · <code>block</code> · <code>sankey</code> · <code>gantt</code> · <code>quadrant</code> · <code>packet</code> · <code>xychart</code> · <code>radar</code> · <code>architecture</code> · <code>treemap</code> · <code>ishikawa</code> · <code>wardley</code> · <code>venn</code> · <code>cynefin</code> · <code>usecase</code> · <code>treeview</code> · <code>eventmodeling</code> · <code>agentflow</code> · <code>zenuml</code> (read-only rendering) · <code>c4</code>

</details>

## Getting started

You need Node.js 20.19+ (required by Vite 7) and npm.

```bash
git clone https://github.com/ZZY2357/visual-mmd.git
cd visual-mmd
npm install
npm run dev        # dev server, default address http://localhost:5173
```

Production build and local preview:

```bash
npm run build
npm run preview
```

> Your diagrams are stored only in your browser (localStorage) and never uploaded to any server. Before switching browsers or clearing site data, export your diagrams as `.mmd` backups.

## Contributing

Issues are welcome — when reporting a bug, please include the Mermaid source that reproduces it and the steps to reproduce. PRs are welcome too; for larger changes, please open an issue first to discuss it.

## License

[MIT](LICENSE) © 2026 ZZY2357
