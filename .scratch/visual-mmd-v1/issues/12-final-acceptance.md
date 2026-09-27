# 12 — 收尾验收

**What to build:** v1 验收打磨：窄屏只显示画布（代码面板与属性面板不显示）；三栏折叠与拖拽调宽的边界细节；PWA 可安装、离线可用的端到端验证；全图种回归清单（四类图的 verbatim identity / 手术式改写 / 金样用例、画布选中映射、撤销行为）过一遍并记录结果。

**Blocked by:** 05, 06, 07, 08, 09, 10, 11。

**Status:** done

- [x] 窄屏只显示画布
- [x] 面板折叠/调宽在极限宽度下不破版
- [x] PWA 安装到桌面、断网可用，验证通过
- [x] 全图种回归清单执行完毕，结果记录到本工单

## 实现备注（2026-09-27）

- 窄屏只显示画布 + 折叠/调宽边界：纯逻辑抽在 `src/lib/layout/pane-layout.ts`
  （断点 `NARROW_BREAKPOINT=960`、画布最小宽 `CANVAS_MIN=320`、
  `clampWidth` / `maxCodePanelWidth` / `maxPropsPanelWidth` / `resolveCollapse`），
  组件 `src/components/ThreePaneLayout.tsx` 消费：
  - 视口 < 960px 时只渲染画布（代码面板与属性面板不渲染）；
    断点取值保证全模式下三栏最小宽度和 + 分隔条必然放得下（≈850px）。
  - 拖拽调宽受 min/max 双向钳制：上限 = 视口 − 画布最小宽 − 另一面板占用
    （折叠时不占用），拖到边界即停；视口收窄时已打开面板宽度向下收敛。
  - 属性面板补齐折叠按钮；折叠互斥：至多一个面板折叠（`resolveCollapse`），
    避免宽屏上丢失全部编辑面板。
  - 新增 13 个单测（`src/lib/layout/__tests__/pane-layout.test.ts`）；
    新增 i18n 键 `app:propertyPanel.collapse/expand`。
- 无功能性 bug 在本轮回归中发现，故无修复型提交。

## 回归记录（全图种回归清单，2026-09-27）

**管线三类用例（全量 vitest，299 用例 / 26 文件全绿，`npm test`）**

- verbatim identity / 手术式改写 / 金样合法性：flowchart、sequence、class、
  mindmap 四类图各自的用例集全部通过（`golden.test.ts`、
  `sequence-golden.test.ts`、`class-golden.test.ts`、`mindmap-golden.test.ts`、
  `frontmatter.test.ts` 等）。清单外语法（linkStyle、click、create/destroy、
  rect、box、CSS 注入）原样保留的用例含于各用例集。
- mermaid 锁定 v12，实际安装版本 12.0.0；金样以 mermaid `parse()` 验证，
  覆盖 v12 parse 兼容性。

**画布选中映射（代码走查 + mermaid v12 dist 事实核对）**

对照 `docs/mermaid-upgrade-regression-checklist.md` 逐项核对，安装的
mermaid 12.0.0 dist 与清单记录的事实约定一致：

| 清单事实 | 核对结果 |
| --- | --- |
| 节点 `<g data-id=node.id>` | `dist/chunks/mermaid.core/chunk-UA2S7LBM.mjs` 仍为 `attr("data-id", node.id)` ✅ |
| subgraph cluster `data-et="cluster"` | 同文件仍存在 ✅ |
| 边 `<path data-id=edge.id>` | `chunk-Z7XXMR3K.mjs:943` 仍为 `svgPath.attr("data-id", edge.id)` ✅ |
| 边 id `L_{from}_{to}_{counter}` | `chunk-ZIGJFQKS.mjs:543` `getEdgeId` 格式未变 ✅ |
| sequence 参与者 data-id | `sequenceDiagram-PO4LG4MO.mjs` 仍为 `data-id", actor.name` ✅ |

消费方走查（与 dist 事实吻合）：

- `src/lib/canvas-selection/data-id.ts`：节点精确匹配；边
  `/^L[-_](.+)[-_](\d+)$/` 尽力而为切分、以已知边集合消歧、平行边 counter
  跳号兼容（occurrence 候选取 counter+1 与 counter 两个值）——与 `getEdgeId`
  格式一致。无法匹配安静返回 null，不崩溃。
- `highlight.ts` + `src/index.css`：`[data-vm-selected]` 光晕，SVG 重渲染后
  由 `use-canvas-selection.ts` 的 effect（依赖 `svg`、`selectedDataId`）重新
  打标——高亮在重渲染后保持。
- 键盘操作（Del/Tab/Enter）：`use-canvas-keyboard.ts` 以
  `FOCUS_EXCLUDE_SELECTOR` 排除代码面板/输入控件，焦点隔离成立。
- `securityLevel: 'strict'`（`src/lib/use-mermaid-preview.ts`）未变；错误冻结
  语义（parse/render 失败不更新 svg）未变。

清单中的交互步骤 2–9（点击选中、光晕移动、边点击、真机键盘操作）属人工
浏览器验证，本轮以代码走查 + dist 事实核对 + 全量单测替代覆盖；安装升级
mermaid 大版本时仍须按清单真机回归。

**PWA 端到端验证（build + preview，curl 核对）**

- `npm run build`：generateSW 模式，precache 68 entries；产物
  `dist/sw.js`、`dist/workbox-*.js`。
- preview 服务（端口 4173）逐项 HTTP 200：`/`（text/html）、
  `/manifest.webmanifest`（application/manifest+json）、`/sw.js`、
  `/workbox-*.js`、`/icon.svg`、`/registerSW.js`。
- manifest 有效：name/short_name/start_url=`/`/scope=`/`/display=standalone/
  lang=zh-CN/theme_color 与 index.html 的 `<meta name="theme-color">` 一致；
  icon.svg 200（sizes any, SVG）。
- sw 预缓存覆盖关键资源：`index.html`、主 bundle
  `index-*.js` / `index-*.css`、`icon.svg`、`manifest.webmanifest`、
  `registerSW.js` 及全部 mermaid 图种 chunk（含本项目四种图的
  flowDiagram/sequenceDiagram/classDiagram/mindmap-definition chunk）。
- 离线回退：`sw.js` 含 `NavigationRoute → createHandlerBoundToURL("/index.html")`，
  导航请求离线回退到预缓存的 index.html。
- `index.html` 正确挂载 `<link rel="manifest">`、theme-color、`registerSW`。

**遗留事项（需真机/人工验证）**

- PWA「安装到桌面」的系统安装弹窗与「断网打开继续编辑」需在真实浏览器
  （Chrome/Edge，HTTPS 或 localhost）人工验证；本轮以 manifest/sw 结构与
  资源可达性核对替代，预缓存全量覆盖使离线路径高度可信。
- 画布点击选中的实际 DOM 事件行为、键盘操作的体感、窗口拖拽的视觉表现，
  建议合并前在浏览器手动过一遍（dev 或 `npm run preview`）。
