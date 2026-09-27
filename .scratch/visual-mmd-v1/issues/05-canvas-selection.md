# 05 — 画布选中与键盘操作

**What to build:** 点击画布（mermaid 渲染预览）中的节点选中它，属性面板定位并展开其属性、图中高亮选中。选中节点后支持键盘操作：Del 删除、Tab 添加子节点、Enter 添加同级节点。选中机制基于渲染 SVG 的 data-id 事实约定（ADR-0007），实现为图种无关的通用能力，后续新图种自动受益；边不承诺画布选中，以结构树为主入口。

**Blocked by:** 04 — Flowchart 可视化编辑端到端。

**Status:** done

- [x] 点击画布节点 → 属性面板定位展开该元素，图上高亮
- [x] Del 删除选中节点、Tab 添加子节点、Enter 添加同级节点，均手术式落码并可撤销
- [x] data-id 无法匹配的元素不崩溃，退化为仅结构树可选中
- [x] 升级 mermaid 大版本的回归检查清单写入文档

## Comments

- 实现（2026-09-27）：通用选中能力落在 `src/lib/canvas-selection/`（`data-id.ts` 纯匹配逻辑、`highlight.ts` 纯高亮标记、`use-canvas-selection.ts` Hook、`flowchart-adapter.ts` 图种适配器）；flowchart 之外的新图种只需提供一个 `DataIdResolver` 即可接入。节点按 data-id 精确匹配（ADR-0007），边按 mermaid 的 `L_{from}_{to}_{counter}` 尽力而为匹配。
- 键盘操作：`src/lib/editing/canvas-keyboard.ts`（纯逻辑：键位映射、新节点 id 推断、子/同级节点推断 → 编辑意图序列）+ `use-canvas-keyboard.ts`（window 级监听，焦点在代码面板/输入控件时不触发）；意图经 `commitIntent` 手术式落码，快照入栈可撤销，添加后自动选中新节点。
- 回归检查清单：`docs/mermaid-upgrade-regression-checklist.md`（含 v12 data-id 事实约定的代码位置表）。
- 测试：新增 33 个用例（data-id 匹配、高亮标记、键位映射、意图序列、管线落码手术式断言）；全量 141 用例通过，typecheck + build 通过。
