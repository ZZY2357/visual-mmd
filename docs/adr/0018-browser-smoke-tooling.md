# 0018 浏览器契约冒烟用 Playwright + 静态夹具

> **状态：accepted**

日期：2026-10-06（self-grill-hardening 批次，工单 08）

## 背景

本仓唯一锚在 **mermaid 非公开 API** 上的契约是「渲染产物可寻址」：节点/连线靠
`data-id`（ADR-0007）被画布点击、高亮与方位导航寻址，而 `data-id` 由画布的渲染后处理链
（`annotateNodeDataIds` → 各图种 `nodeAnnotator` / `edgeAnnotator` → `addEdgeHitAreas`）
在 mermaid 输出上就地反注。mermaid 升级时，这条链最先亮红灯，而单元测试（happy-dom）
跑不到真实渲染器。

AGENTS.md 的「默认不做浏览器测试」不变——本 ADR 记录登记在案的**唯一例外**：
一个最小化的 DOM 契约冒烟，挂在 CI 上，不进入日常开发循环。

## 决策

1. **工具用 Playwright**（`@playwright/test`）：与既有 `playwright-cli` 真机走查同生态、
   自带 webServer 编排与超时控制、CI 上只装 chromium 即可。
2. **夹具是静态页，不驱动整个 app**：`e2e/harness/index.html` 只 import mermaid + 注册表 +
   金样语料（工单 05 的 `GOLDEN_CORPUS`）+ 画布能力包，把 app 的渲染后处理链**逐字复用**，
   再把「DOM 里有哪些 data-id / 哪些能被该图种 resolver 认领 / 能力包声明的 navigationIds
   是否在 DOM 里找得到」汇总成 JSON 挂到 `window.__smoke`。驱动三栏 app 要拉起 Mantine /
   CodeMirror / zustand / localStorage 引导，链路长、慢、噪音大，而它验的不是这些。
3. **只渲染每图种第一条金样**（31 帧），总时长硬上限 30s（`globalTimeout`），超时即失败。
4. **zenuml 登记声明、不渲染**：外部渲染器（`@mermaid-js/mermaid-zenuml`，懒加载的
   `@zenuml/core` 约 37MB），且按 ADR-0007 画布整体不可寻址——渲染它对 data-id 契约零增益，
   在 dev server 下按模块粒度服务会直接吃掉 30s 预算。冒烟断言的是「外部 + 非可寻址的声明
   被如实兑现」，故只登记不渲染。
5. **与 vitest 完全隔离**：`playwright.config.ts` 的 `testDir` 是 `e2e/`，而根 `vite.config.ts`
   的 vitest `include` 只收 `src/**/*.test.{ts,tsx}`，所以 `npm test` 不会捡到冒烟；
   冒烟走独立脚本 `npm run smoke`，CI 里是独立 job。

## 后果

- mermaid 升级若动了 DOM 结构或 `data-id` 反注口径，CI 的 smoke job 会先红，且失败信息
  直接指出是哪个图种的哪条声明没兑现。
- 冒烟夹具**只 import、不改 src**：夹具里的后处理链顺序若与 `use-canvas-selection` 漂移，
  冒烟就会失真——顺序变更时需同步夹具（已在夹具头注释登记）。
- 本地默认不跑冒烟（`npm test` 不含它）；只有 `npm run smoke` 或 CI 才跑。
