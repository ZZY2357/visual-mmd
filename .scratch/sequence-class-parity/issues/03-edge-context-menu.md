# 03 连线的右键菜单（先删除、再编辑动作）

Status: resolved

**Blocked by: 02**（没有连线身份就没有右键目标）

来源：`spec.md` 的 Q3 定案（(甲) 起步 + (乙) 收尾，(丙) 明确否掉）。补的是工单 06 自认的洞
（`06-class-sequence-node-context-menu.md:111`「对 class/sequence 的连线仍返回 null」）。

## 需求

### 阶段一（(甲)：验证寻址链路）

连线右键只放**删除**：

- class 关系边 → `delete-relation { elementId }`（`class.ts:906`，已存在）
- sequence 消息线 → `delete-message { elementId }`（`sequence.ts:957`，已存在）

**不新增任何 pipeline 意图**，纯 UI 接线。

### 阶段二（(乙)：同等待遇）

- **class 关系边**：改关系类型（`set-relation` 的 `kind`）、改两端基数（`cardFrom` / `cardTo`）、
  改标签（`label`）、删除。
- **sequence 消息线**：改箭头（`arrow`）、改 act（`act`）、改文本（`text`）、删除。

**明确否掉 (丙)**：不再新增表单浮层。画布上显示的应是"这个元素能做什么"的菜单，
而不是又一个表单。阶段二的字段编辑**直接改**（如箭头类型用子菜单/循环切换）或走**已有的**
节点表单浮层机制，不新建组件。

## 落码位置

- `src/lib/editing/context-menu.ts`：
  - `ContextMenuTarget` 增加连线目标（沿用 02 的位置序身份）。
  - `contextMenuTargetFromSelection`（`:55-69`）的 **edge 分支**：从"只认 flowchart"改为覆盖
    class/sequence。**注意该分支现状**是 flowchart 返回目标、其余图种返回 `null`——不要破坏
    flowchart 既有行为。
  - `ContextMenuItemId` 增加所需项；`contextMenuItems`（`:60-70`）补 case。
  - 文件头注释 `:15-17` 的"sequence/class 的连线本轮未定义"要同步改掉。
- `src/lib/editing/use-canvas-context-menu.ts`：动作接线（删除 → `ctx.deleteTarget()`；
  编辑类动作参考既有 `styleForm` 的浮层机制）。
- `src/components/CanvasPanel.tsx`：菜单项 dispatch；删除项红色高亮从
  `delete-class` / `delete-participant` **扩到连线删除项**（既有模式见工单 06 Comments）。
- i18n：新菜单项文案。

## 不变量

- 连线**内联编辑不做**（spec 的决策：双击只用于 class 类名与 sequence 别名，见 05）。
- 节点菜单（工单 06 的三个/两个菜单项）不回归。
- flowchart 的 edge 菜单不回归。

## 测试

- `context-menu.test.ts`：连线目标 → 菜单项列表；**改掉**现有断言
  （`:55-59`「sequence/class 的连线本轮未定义 → null」需反向）。
- `use-canvas-context-menu.test.tsx`：点击连线菜单项 → 断言 `commitIntent` 的意图与参数。
- pipeline 的 delete 意图已有单测覆盖，无需新增。

## 验收

- [ ] class 图：右键一条关系边 → 出现菜单；删除后该 relation 消失、其余关系不受影响、图可渲染。
      （本轮未做真机确认——用户指示跳过真机验收）
      单测已覆盖「出现菜单 / 删除只影响该条 / 其余关系逐字保留」；`RelationForm` 承接编辑已核到
      `PropertyPanel.tsx:164-166`。「图可渲染」属真机项。
- [ ] sequence 图：右键一条消息线 → 出现菜单；删除后该消息消失、其余消息不受影响、图可渲染。
      （本轮未做真机确认——用户指示跳过真机验收）
      同上，单测覆盖菜单与删除范围；渲染确认属真机项。
- [ ] 阶段二：改箭头/类型/基数/标签后落码正确、可撤销。
      （本轮未做真机确认——用户指示跳过真机验收）
      改类型 / 改箭头有单测（`set-relation { kind }` / `set-message { arrow }` + undo）；
      基数与标签走右侧 `RelationForm`（沿用 flowchart 的 `edit-label` 既定链路），
      管线落码由既有 `class.test.ts:169` 覆盖，但「菜单 → 关菜单 → 右侧表单改基数/标签」的
      整条交互链只有真机能确认。
- [x] 所有落码走 `commitIntent`（撤销/重做可用）。
      单测以 `vi.spyOn(commitIntent)` 断言意图与参数，并断言 `canUndo` / `undo()` 回到原源码。
- [x] flowchart 与 class/sequence 的**节点**菜单均不回归。
      `context-menu.test.ts` 的 flowchart 节点/连线、mindmap、class/sequence 节点断言逐字未改，全绿。
- [ ] 控制台 0 error / 0 warning。
      （本轮未做真机确认——用户指示跳过真机验收）

---

## Comments

### 改动内容

| 文件 | 新建/修改 | 内容 |
|---|---|---|
| `src/lib/editing/context-menu.ts` | 修改 | `ContextMenuItemId` 增 8 项；`contextMenuItems` 补四类连线 case；文件头与函数注释同步（原文「menu 项为空 → 右键安静不弹」已改） |
| `src/lib/editing/use-canvas-context-menu.ts` | 修改 | `selectTarget` 覆盖四类连线（右键即联动选中，右侧表单据此出现）；`deleteTarget` 接 `delete-relation`/`delete-message`/`delete-note`/`delete-block`；新增 `cycleRelationKind`/`editRelation`/`cycleMessageArrow`/`editMessage`；新增纯函数 `nextInCycle` |
| `src/components/CanvasPanel.tsx` | 修改 | `DESTRUCTIVE_MENU_ITEMS` 扩到 4 个连线删除项；`onMenuItem` 分发 6 个新菜单项 |
| `src/i18n/index.ts` | 修改 | 新增 8 条 `app:canvas.menu.*` 文案 |
| `src/lib/editing/__tests__/context-menu.test.ts` | 修改 | 反向「连线目标本轮还没有菜单项 → []」（改为四类连线的菜单项断言，拆成 2 条）；文件头注释同步；给 `kind:edge → null` 那条补注释说明为何保留 |
| `src/lib/editing/__tests__/use-canvas-context-menu.test.tsx` | 修改 | `resolverOf` 补位置序连线解析（与 `CanvasPanel` 同约定）；新增 `describe('工单 03 连线菜单')` 10 条用例 |

### note / block 的边界裁定：**顺带接上删除，不补编辑动作**

- **接上**：`delete-note` / `delete-block` 意图早已存在（`sequence.ts:994` / `:1008`），
  工单 02 已把 `note` / `block` 打通为位置序连线目标，接线成本确实≈0——只加两个菜单项 id、
  两条 `deleteTarget` 分支、两条 i18n 与 `DESTRUCTIVE_MENU_ITEMS` 的两项。
- **不补编辑**：本票只给它们删除。`note` / `block` 的字段（位置/参与者/文本、关键字/标签）
  仍走右侧 `NoteForm` / `BlockForm`，右键已联动选中即已可达——若在本票给它们也挂
  `edit-note` / `edit-block`，则四类连线目标要有三套编辑动作，改造面明显扩大，且
  工单需求只点名了 class 关系边与 sequence 消息线。故按「不为此扩大改造面」办了。
- 因此最终菜单：`class-relation` = 切换类型 / 编辑基数与标签 / 删除；
  `sequence-message` = 切换箭头 / 编辑激活与文本 / 删除；
  `sequence-note` = 删除；`sequence-block` = 删除。

### 关键取舍

1. **不新增表单浮层（spec 决策 (丙)）**。阶段二的字段编辑只有两条路：
   - **直接改**：关系类型、消息箭头做成菜单项 **循环切换**（`nextInCycle` + `set-relation { kind }` /
     `set-message { arrow }`）。这两个字段取值是有限枚举（`RELATION_KIND_OPTIONS` 6 种、
     `MESSAGE_ARROW_OPTIONS` 4 种），循环是最轻的「直接改」。
     循环动作**不关菜单**——连点即可切到目标值（其余菜单动作照旧关菜单）。
   - **沿用 flowchart 既定链路**：基数/标签、激活/文本是自由文本，做一个「编辑…」菜单项，
     动作 = 关菜单；右键时已 `select` 该边，`PropertyPanel` 会渲染 `RelationForm` /
     `MessageForm`（`PropertyPanel.tsx:164-166`、`:94` 起）。这与 flowchart 的
     `edit-label`（`use-canvas-context-menu.ts:421` 只 `closeMenu()`）完全同构，不是新机制。
2. **选中联动是新增的必要接线**：工单 02 的 `selectTarget` 不含连线目标，若不补，右键连线不会
   选中，「编辑」项就落空；同时也会让画布连线高亮与右键目标不一致。
3. **flowchart 与 class/sequence 节点菜单的回归风险**：`contextMenuTargetFromSelection` 一行未动；
   `contextMenuItems` 只增 case；`deleteTarget` / `onMenuItem` 只增分支——既有断言全部逐字保留。
4. `kind: 'edge'`（flowchart 形态的选中）在 class/sequence 仍返回 `null`：class/sequence 的连线
   身份是**位置序**（`kind: 'element'`），保留该断言防止两套寻址被混淆。

### 测试结果

- `npx vitest run src/lib/editing/__tests__/context-menu.test.ts` → 22 tests passed
- `npx vitest run src/lib/editing/__tests__/use-canvas-context-menu.test.tsx` → 39 tests passed
- `npm test` → **49 个测试文件 / 661 个用例，全绿**（基线 650 → +11：连线菜单 10 条 +
  原「空菜单」反向拆成 2 条）
- `npm run typecheck` → 通过

### 待真机确认清单

1. **class 图**：右键一条关系边 → 菜单出现且含三项、菜单项「删除关系」为红色；点删除后
   该 relation 消失、其余关系保留、mermaid 重渲染无语法错误（控制台 0 error/0 warning）。
2. **sequence 图**：右键一条消息线 → 同上；删除后消息消失、其余消息保留、图仍可渲染。
3. **切换关系类型 / 切换箭头**：连点应逐级循环（`-->` → `..>` → …；`->>` → `-->` → `-x` → `--`），
   每次落码正确、可撤销；菜单在切换后仍停在同一位置。
4. **编辑基数与标签 / 编辑激活与文本**：点该菜单项后菜单收起，右侧属性面板显示
   `RelationForm` / `MessageForm`，改字段后源码与画布同步、可撤销。
5. **注释 / 逻辑块**：右键只出现「删除注释」/「删除逻辑块」；删除块时 open 到匹配 end
   整段消失，块内消息一并消失且图仍可渲染。
6. **不回归**：flowchart 节点/连线菜单、mindmap 菜单、class/sequence 节点菜单行为不变；
   连线模式（从这里连线）与背景拖拽在菜单打开时不误触（工单 08 曾修过的
   `setPointerCapture` 劫持）。

### 工单 05 的口径同步（2026-09-29，本票阶段二承诺改口径的留痕）

本票阶段二曾承诺「改两端基数 / 改标签 / 改 act / 改文本」在菜单里**直接改**或走已有节点表单浮层。
实际落码是第三条路：菜单项 = 关菜单，靠右侧属性面板编辑。口径由后续批次（`parity-review-followups`
的 D5）裁定为 **(乙) 承认现状即兑现，改口径 + 改文案**，工单 05 据此落码：

- **改关系类型 / 改箭头**：维持本票原样（菜单内循环直接落码，菜单不关）。
- **改基数 / 改标签 / 改 act / 改文本**：**经属性面板完成**——菜单项语义写成
  「选中该连线 + 关闭菜单」（不再是只有 `closeMenu()` 的空壳），字段在右侧
  `RelationForm` / `MessageForm` 改；菜单项文案由「编辑基数与标签」/「编辑激活与文本」
  改为「**在属性面板中编辑**」，消除「点了没反应」的错觉。

理由（详见 `parity-review-followups/spec.md` 的 F5 与工单 05）：ADR-0001 是表单驱动编辑，
`CONTEXT.md` 把属性面板定义为选中元素属性表单的入口；菜单内再开一套基数 / 标签编辑等于引入
第二个编辑入口，与本票「明确否掉 (丙)：不再新增表单浮层」的立意一致。

### 遗留风险

- 循环切换用的是 `latest.current.projection` 里的**当前值**。真实 app 每次编辑后重渲染、
  投影随之更新，连点循环正常；但在投影未及时更新的极端情况下，连点可能重复写入同一取值
  （无副作用，仅表现为「没往前走」）。
- 「编辑×」两个菜单项是「关菜单 + 依赖右侧面板」的弱动作：若属性面板被折叠或不显眼，
  用户可能觉得点了没反应。与 flowchart `edit-label` 同款，属既有交互债务，本票不改造。

