# 07 class / sequence 的 `direction` 表单

Status: pending

**Blocked by: 01**（同为模型/外观配置项，与参与者生命区间同一批；无硬依赖，可并行）

来源：`spec.md` 的 Q10 定案（(丙)：只做 `direction`，`linkStyle` / `cssClass` 不做）。

## 背景

- `class.ts:25-26`、`:411` 明确把 `direction` 列为"不解析、原样保留"。
- Q10 定案：`linkStyle` / `cssClass` **不做**（flowchart 同样没做，单独给 class/sequence 做会
  造出一个**比 flowchart 更完备的样式编辑器**，优先级奇怪）；但 `direction` 做——
  它**改变布局方向**，用户切一下就能看出差别，且与 flowchart 的同类选项可对齐。

## 需求

1. **解析 `direction`**：class 的 `direction LR` / `RL` / `TB` / `BT`；sequence 的 `direction`
   （决定消息自上而下还是自左向右）。
2. **属性面板的表单**：图表级选中时出现方向选择器。
   - **回显必须如实**：源码里没有 `direction` 时显示「跟随 Mermaid 默认」，**不假装是某个值**
     （这是主题选择器踩过的坑，见 `spec.md`（editor-polish）的"选择器回显"决策）。
3. **写回**：选中方向即手术式插入/改写 `direction` 行；切回「跟随默认」即**删除该行**，
   未触碰文本逐字保留。
4. **align with flowchart**：flowchart 若已有 direction 表单，**复用同一组件与文案**；
   若 flowchart 没有，本票也不为 flowchart 新增（不在范围）。

## 落码位置

- `src/lib/pipeline/class.ts` / `sequence.ts`：`direction` 解析 + `set-direction` 意图；
  注释 `:25-26`、`:411` 同步改。
- `src/lib/projection/*.ts`：图表级投影补 `direction` 字段。
- `src/components/{class-forms,sequence-forms}.tsx`：方向选择器（或复用 flowchart 的既有实现）。
- 属性面板：图表级分支接线。
- i18n：方向选项与「跟随默认」文案。

## 不变量

- **`linkStyle` / `cssClass` / `style` 仍原样保留**（本票不动，spec 的非目标）。
- 主题的既有语义不受影响（主题与 direction 是两个独立配置项）。
- 撤销/重做：新意图走 `commitIntent`。

## 测试

- `class.test.ts` / `sequence.test.ts`：`direction` 解析、写回、删除、verbatim identity。
- 表单单测（如有既有模式则补）。

## 验收

- [ ] class 图：图表级选中 → 选 LR，源码出现 `direction LR`、图变为横向布局。
- [ ] sequence 图：同理，消息方向改变。
- [ ] 选「跟随 Mermaid 默认」→ 源码里的 `direction` 行被删除、其余文本逐字不变。
- [ ] 源码里 `direction` 值非法/缺失时，选择器如实回显，不假装。
- [ ] `linkStyle` / `cssClass` 仍逐字保留、不报错。
- [ ] 控制台 0 error / 0 warning。
