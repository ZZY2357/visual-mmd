# 02 · 把手术式插入提为共享内核

Status: needs-triage
Blocked by: —
Type: task

## 现状（已核实）

`insertAfter` 在四个 parser 里各当一份 private method，共 **15 处调用**：

| parser | 位置 | 调用点 | 锚点策略 | 行拼接 |
| --- | --- | --- | --- | --- |
| flowchart | `flowchart.ts:1082` | 5 处 | **推到该行最靠后的元素**（适配 `A --> B --> C` 链式语句） | `'\n' + indent + line` |
| class | `class.ts:676` | 6 处 | 元素本身 | `'\n' + indent + line` |
| sequence | `sequence.ts:684` | 4 处 | 元素本身 | `'\n' + indent + line` |
| mindmap | `mindmap.ts:385` | 若干 | 元素本身 | 行自带换行，锚点缺行尾时补 `\n` |

- class 与 sequence 两份**逐字相同**。
- `lineIndent` 三份逐字相同：`flowchart.ts:1395` / `class.ts:1104` / `sequence.ts:1193`。
- mindmap 那份没有 `lineIndent`——mindmap 的缩进就是结构层级，行内容自带缩进，语义确实不同。

它们守的是同一条不变量：**逐字保留**（ADR-0008）。这条不变量的实现住在四个 private method 里，
改缩进口径要改三处，改锚点语义要判断四处。

## 方案形状

新建 `src/lib/pipeline/insert.ts`。四个实现只在两个轴上不同——**锚点策略**与**行拼接方式**，
故内核只收这两个参数：

```ts
export function insertAfter(
  doc: SourceDocument,
  opts: {
    /** 缺省 = 文档最后一个元素 */
    afterElementId?: string
    /** 锚点策略：'self' = 元素本身；'line-end' = 推到该行最靠后的元素（flowchart 链式语句） */
    anchor?: 'self' | 'line-end'
    /** 返回追加到锚点原文之后的文本；indent 由内核算出，original 是锚点原文（mindmap 靠它判行尾） */
    render(indent: string, original: string): string
  },
): Map<string, string> | null
```

四个调用方各自只剩一行 `render`：

- flowchart：`(indent) => newLines(indent).map((l) => '\n' + indent + l).join('')` + `anchor: 'line-end'`
- class / sequence：同上，`anchor` 缺省
- mindmap：`(_indent, original) => (/[\n\r]$/.test(original) ? '' : '\n') + lines.join('')`

`lineIndent` 一并收进本模块并导出（mindmap 不用，但另外三处共用）。

接口 = 1 个函数 + 2 个策略参数，实现吃掉锚点推进、缩进探测、span 重写。**4 个 adapter，一个真 seam。**

## 分步

1. 建 `insert.ts`，搬入 `lineIndent` 与 `insertAfter`，暂不改任何调用方。
2. **flowchart 先接**（它是最特殊的那个：锚点推进）。跑 `pipeline/__tests__/flowchart*` + `golden*`。
3. class 接、sequence 接——这两份原本逐字相同，接完后两者的 diff 应当为空，这是自检点。
4. mindmap 接（走 `render` 的 `original` 参数）。
5. 删除四处 private 方法与三份 `lineIndent`。
6. 全量回归。

## 测试

新增 `pipeline/__tests__/insert.test.ts`，直接打在内核接口上（这是真 seam）：

- `afterElementId` 缺省 → 锚点取文档最后一个元素
- `anchor: 'line-end'` → 同一行有多个元素时锚点是 span.end 最大者
- 锚点不存在 / 文档无元素 → `null`（不抛错、不产生重写）
- 缩进跟随锚点行（空缩进、空格缩进、Tab 缩进三种）
- mindmap 形态：锚点原文已带 `\n` 时不重复补
- 逐字保留：插入后锚点前后的原文逐字不变（用 `verbatim-identity` 的既有口径）

既有的 `pipeline/__tests__/surgical.test.ts` 与四个 `*-golden.test.ts` 应当全绿且不改一句话——
它们是这次重构的护栏。

## 验收

- `grep -c 'private insertAfter'` 在四个 parser 里均为 0。
- `grep -c 'function lineIndent'` 全库为 1。
- 全量测试绿，且 golden 测试零改动。

## 风险

- **flowchart 的锚点推进是有意行为**（链式语句 `A --> B --> C` 插入新语句必须落在行末，
  否则会插到链中间产生语法错误）。第 2 步必须单独验这一条，建议补一条链式语句的用例。
- mindmap 的 `anchorEol` 判据（`/[\n\r]$/`）看着丑但来自实测，搬进内核时**不要顺手"美化"**。

## Decision（已定案）

**独立 `src/lib/pipeline/insert.ts`。**

被否掉的替代是并入 `pipeline/document.ts`（92 行）：`document.ts` 现在只管文档结构与重组
（`SourceDocument` / `assembleDocument` / `reassemble` / `getElementById`），
插入语义（锚点策略、缩进探测、span 重写）塞进去会让它同时承担两种变更理由。

`lineIndent` 一并收进 `insert.ts` 而非 `span.ts`——它是插入语义的一部分，不是通用的 span 工具。
