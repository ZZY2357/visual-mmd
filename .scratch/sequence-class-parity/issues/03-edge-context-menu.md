# 03 连线的右键菜单（先删除、再编辑动作）

Status: pending

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
- [ ] sequence 图：右键一条消息线 → 出现菜单；删除后该消息消失、其余消息不受影响、图可渲染。
- [ ] 阶段二：改箭头/类型/基数/标签后落码正确、可撤销。
- [ ] 所有落码走 `commitIntent`（撤销/重做可用）。
- [ ] flowchart 与 class/sequence 的**节点**菜单均不回归。
- [ ] 控制台 0 error / 0 warning。
