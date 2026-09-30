/**
 * 连线的「位置序」身份（ADR-0012，工单 02）。
 *
 * 画布要让连线可点选、可右键，就必须给每条连线一个能落到 DOM 上的身份。ADR-0012 定案：
 * 身份的来源**不是** mermaid 渲染出的 `data-id`——实测它会随「中位插入」重排
 * （class 的 `id_{源}_{目标}_{N}`、sequence 的 `iN`），而本 app 的右键加关系/加消息正是
 * 中位插入，所以 data-id 在最常见的操作路径上恰好失效。改用**位置序**：连线在投影中的
 * 顺序，parser 从源码直接算出，可测可控。
 *
 * 位置序身份**直接采用投影的 elementId**（`relation:1` / `message:2` / `note:1` / `block:1`），
 * 不另造一套编号：
 * - pipeline 已按源码顺序给每条语句分配了它（`class.ts` 的 `relation:${counters.relation}`、
 *   `sequence.ts` 的 `message:${counters.message}` 等），1 基；
 * - 本模块的「位置序」是画布侧的数数口径（0 基）——第 k 个候选（文档序 = 源码序）就是
 *   `ordinal = k`，对应 elementId `kind:(k+1)`；
 * - 选中链路里 elementId 本就是编辑意图的寻址键，画布身份与它同源，无需额外的转换表，
 *   也就不会出现「两种身份谁也不认识谁」的错位。
 *
 * 本模块是纯函数（无 DOM，可单测）；DOM 侧的标注与命中在 `edge-locate.ts`。
 * **节点寻址不受影响**：ADR-0007 对节点仍成立（节点 data-id = 类名/参与者名，稳定），
 * 本模块只覆盖连线与块级元素。
 */

/** 位置序身份的种类：投影里各自独立编号的连线/块级元素（transition = state 转移，工单 02） */
export type EdgeIdentityKind = 'relation' | 'message' | 'note' | 'block' | 'transition'

/** 位置序身份形态 `<kind>:<1 基序号>`；与 pipeline elementId 逐字一致 */
const EDGE_IDENTITY_RE = /^(relation|message|note|block|transition):([1-9][0-9]*)$/

/**
 * 是否为位置序身份（`relation:1` / `message:2` / `note:1` / `block:1` / `transition:1`）。
 * 用于把「连线身份」与节点 id、mermaid data-id（`id_A_B_1`、`i1`、`L_A_B_0`）区分开。
 */
export function isEdgeElementId(value: string): boolean {
  return EDGE_IDENTITY_RE.test(value)
}

/**
 * 0 基位置序 → elementId（`edgeElementIdOf('relation', 0)` = `'relation:1'`）。
 * 序号非法（负数 / 非整数）时返回 null——绝不凭空造出身份。
 */
export function edgeElementIdOf(kind: EdgeIdentityKind, ordinal: number): string | null {
  if (!Number.isInteger(ordinal) || ordinal < 0) return null
  return `${kind}:${ordinal + 1}`
}

/** elementId → 种类与 0 基位置序；不是位置序身份时返回 null（不抛错） */
export function edgeOrdinalOf(elementId: string): { kind: EdgeIdentityKind; ordinal: number } | null {
  const m = EDGE_IDENTITY_RE.exec(elementId)
  if (m === null) return null
  return { kind: m[1] as EdgeIdentityKind, ordinal: Number(m[2]) - 1 }
}
