# 13 `Note left of X` / `Note right of X` 的参与者解析不出来：级联删除漏删该 note，被删参与者又被 mermaid 隐式复现

Status: needs-triage

来源：修复波（08–12）浏览器复验时的**题外发现**（非本批清单条目）。与工单 10/11 同属
sequence 侧缺陷，但根因独立：`parseNoteLine` 解析不出 `left of` / `right of` 的参与者。

## 需求

复现步骤：

1. 打开 `http://localhost:5207/`，`localStorage.clear()` 后 reload。
2. 把源码整体改写为：
   `sequenceDiagram\n    actor 甲\n    participant 乙 as Bee\n    Note right of 乙: 注释\n    甲->>乙: hi\n`
   （`Note left of 甲` 同理）。
3. 在画布上对参与者「乙」真实右键 → 点「删除参与者」。
4. 读源码与画布上的参与者框。

预期：

- 引用被删参与者「乙」的语句**全部**级联消失（含这条 `Note right of 乙`，因为它的锚点就是 乙）；
- 被删参与者在画布上不再出现。

## 实测

第 3 步之后源码（`localStorage['visual-mmd:library']` 与代码面板逐字一致）：

```text
sequenceDiagram
    actor 甲
    
    Note right of 乙: 注释
    
```

即 `participant 乙 as Bee` 与 `甲->>乙: hi` 都按预期删掉了（留下空白行），但
**`Note right of 乙: 注释` 仍在**。随后画布上参与者框 = **`["乙","i0","甲"]`** —— 被删的
「乙」**又被 mermaid 隐式复现**了（mermaid 会为 note 里引用的未声明参与者自动建框）。

最小对照（与 app 无关，纯 mermaid）：源码
`sequenceDiagram\n    actor 甲\n    Note right of 乙: 注释\n`（乙 从未声明）渲染出的
`g[data-id]` = `["乙","i0","甲"]` —— 证实 **悬挂的 `Note right of 乙` 足以让 mermaid 造出 乙 框**。

## 根因

解析层（`src/lib/pipeline/sequence.ts:212-244`）：

- `parseNoteLine` 的正则 `^([ \t]+)(over|left of|right of)(.*?):(.*)$` 里，pos 分组
  `(over|left of|right of)` **把 `of` 一起吃掉了**，于是捕获到的 `mid` 只剩参与者名（` 乙`）。
- 之后 `parseAfterOf(mid)` 的正则 `^[ \t]+of[ \t]+([^\s:,]+)[ \t]*$` **又要匹配一次 `of`** ——
  此时 `mid` 里已无 `of`，必然返回 `null`。
- 结果：`pos` 解析正确（`'right'` / `'left'`），但 **`actors === null`**；只有 `Note over` 走
  `parseOverActorList`（不吃 `of`）能拿到参与者。

实测（parse 探针，源码含 `Note right of 乙` + `Note left of 甲` + `Note over 甲,乙`）：

```text
"right|null|mid=\" 乙\""
"left|null|mid=\" 甲\""
"over|[\"甲\",\"乙\"]|mid=\" 甲,乙\""
```

派生后果（两处，均由上述 `actors === null` 直接导致）：

1. **级联删除漏删**：`referencesActor`（`sequence.ts:574-587`）用
   `(data as NoteData).actors?.includes(actorId) === true` 判定 note 是否引用该参与者 ——
   `actors` 为 `null` 时恒为 `false`，故 `Note left/right of X` 永不被级联删除（本单主症状）。
   注意 `rename`（改参与者 id，`sequence.ts:557-561`）**有** `note.actors !== null` 守卫，
   `resolveSetNote`（`:708-733`）也安全（`?? note.actors` + `!== null` 判定），
   唯独 `referencesActor` 这条路径漏判。
2. **投影与画布背离**：`sequence-projection.ts:127` 是 `for (const a of n.actors ?? []) touch(a)` ——
   隐式参与者本应来自 note 的引用（`:81-82` 的注释正是这么写的），但 `actors` 为 `null` 时
   该 note 不贡献任何参与者。于是「只在 `Note right of X` 里出现、没有声明也没有消息」的参与者
   会**在结构树缺席、在画布上存在**（ADR-0007 一路在防的那类背离）。

## 修复方向（供实现时参考）

`mid` 在 `left of` / `right of` 两条分支里已经是「参与者名」本身，不该再要求一次 `of`：
让 `parseAfterOf` 直接解析 `mid` 里的单个名字（如 `^[ \t]*([^\s:,]+)[ \t]*$`），或让 pos 分组
只吃 `left` / `right` 而把 `of` 留在 `mid`。两种改法都要保持 `mid` 原样回写
（`renderNote` 在未改 pos/actors 时用 `d.mid` 逐字保留），以免破坏 verbatim 恒等。

## 测试

- `sequence.test.ts`：`Note left of X` / `Note right of X` 解析出 `pos` 与 `actors=['X']`
  （现状断言为 `null` 会失败，即先红后绿）；`Note over A,B` 不受影响。
- 级联删除：含 `Note right of 乙` 的源码删除参与者 乙 后，该 note 行一并消失、不得留下悬挂引用。
- 投影：只有 `Note right of X` 的图里，X 出现在参与者列表（隐式）且只出现一次。
- verbatim：未触碰的 note 行（含 `mid` 的空格）逐字不变。

## Comments

（空）
