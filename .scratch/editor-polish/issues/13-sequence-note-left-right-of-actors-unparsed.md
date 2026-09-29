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

### 修复（2026-09-29）

**根因**（单内分析已复核）：`parseNoteLine` 的 pos 分组 `(over|left of|right of)` 把 `of` 吃进分组，
捕获到的 `mid` 只剩参与者名（`" 乙"`），随后 `parseAfterOf(mid)` 又要求再匹配一次 `of` → 必然 `null`；
`Note over` 走 `parseOverActorList`（不经过 `of`）故不受影响。同一个 `of` 被消费了两次。

**修复**（`src/lib/pipeline/sequence.ts` 解析层，投影代码与渲染语义未动）：
让 `of` 只消费一次 —— pos 分组收窄为 `(over|left|right)`，`of` 放进独立可选分组 `([ \t]+of)?`，
`mid` 恢复为「pos 关键字与冒号之间的原文」（left/right 为 ` of X`，与 `NoteData.mid` 的既有文档语义一致）：

- left/right：`m[3]` 是 ` of`（大小写原样）、`m[4]` 是参与者名 → `mid = m[3] + m[4]`，`parseAfterOf(mid)` 原样命中 `['X']`；
- over：`m[3]` 为 `undefined`，`mid = m[4]`，`parseOverActorList(m[4])` 行为不变；
- 严格性保持：left/right 缺 `of`（`Note left: x`、`Note leftover: y`）仍 `return null` → 该行原样保留（与改前一致）；
- `parseAfterOf` 仍是纯函数（只更新注释），继续单测可覆盖。

**顺带修正的两条同源路径**（均由 `actors === null` 导致，解析修好后自然正确）：

1. `set-note` 只改文本：改前 `renderNote` 用不含 ` of` 的 `mid` 逐字回写 → 产出 `Note right 乙: …`（丢 `of`、语义被改坏）；现在逐字回写整行，no-op 与纯文本编辑都逐字不变（本次把 `mid` 一并纳入 verbatim 断言）。
2. `rename-participant`：改前对 left/right note 从不改写（`note.actors !== null` 守卫恒假）→ 留下指向旧 id 的悬挂 `Note right of 旧名`（mermaid 会隐式复现旧参与者）；现在会一起改名。

**新增测试**（+9）：

- `sequence.test.ts`（+8，新 describe「Note left of / right of 解析参与者（工单 13）」）：left/right 解析出 `pos` + `actors=['甲']`，`Note over 甲,乙` 不变；`mid` 含 ` of X` 且 `renderNote(note, {})` 逐字回写整行；解析 → 重组装 verbatim 恒等；no-op `set-note`（文本未变）整源逐字不变；`it.each(['left','right'])` 级联删除参与者「乙」后 note 行一并消失（`nonBlankLines` 只剩 `sequenceDiagram` / `actor 甲`）且 `expectNoEmptyBranch` 通过；`set-note` left/right → `over` 产出 `Note over 甲: 注释`（不再 `Note over : …`）；`rename-participant` 改 `Note right of 甲` 里的参与者。
- `sequence-projection.test.ts`（+1）：只在 `Note right of 乙` / `Note left of 乙` 里出现的参与者被列为隐式参与者且只出现一次，与显式声明合并后仍只有一个投影项。

**验证**：

1. `npm run typecheck` → exit 0。
2. `npm test` → **44 files / 577 tests 全绿**（基线 44/568，+9）；`verbatim identity（sequence）` 与 `sequence-golden` 均绿。
3. 真实浏览器（本 worktree `npm run dev -- --port 5213`），源码
   `sequenceDiagram\n    actor 甲\n    participant 乙 as Bee\n    Note right of 乙: 注释\n    甲->>乙: hi\n`，
   画布右键参与者「乙」→ 点「删除参与者」：
   - **修复前**（同一浏览器内 `git stash` 掉修复后实测复现，与单内 :5207 记录一致）：源码 =
     `sequenceDiagram\n    actor 甲\n    \n    Note right of 乙: 注释\n    \n`（**note 行仍在**），
     `g[data-id]` = `["乙","i0","甲"]`（**被删的 乙 被 mermaid 隐式复现**），console error 0。
   - **修复后**：源码 = `sequenceDiagram\n    actor 甲\n    \n    \n    \n`（`participant 乙 as Bee`、`甲->>乙: hi`、
     `Note right of 乙: 注释` 全部级联消失，仅留手术式改写留下的行内空白），`g[data-id]` = `["甲"]`（**无 乙**），console error 0。
4. `git status` 仅 3 个预期文件（`sequence.ts` + 两个测试文件）；`.playwright-cli/` 已被 `.gitignore` 忽略。

未覆盖项：投影侧只做了单测（未在浏览器里逐项点验结构树），但结构树与画布同取自该解析产物，级联删除的浏览器验证已覆盖同一根因。
