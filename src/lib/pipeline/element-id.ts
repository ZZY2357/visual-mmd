/**
 * 元素 ID 的编解码（工单 01）。
 *
 * 元素 ID 是编辑意图的寻址键：画布点选、结构树、属性表单都靠它定位源码里的那一行。
 * 协议原先散在四个 parser 的字符串模板里（`node:${id}#${n}` 之类），消费端则在别处
 * 重写同一份协议（正则反解 / 手工拼接）——改协议要同时改对两处，否则寻址静默失效。
 * 本模块把协议收成**一对**编解码：只提供编码不提供解码等于没做。
 *
 * 形状沿用 `canvas-selection/edge-identity.ts`（ADR-0012 已落地的正确样板）：
 * 纯函数、无 DOM、无 React；解析不出就返回 null，绝不凭空造出身份。
 *
 * 放在 `pipeline/` 是因为生成端在这里：projection 本就依赖 `pipeline/document`，
 * 不新增依赖方向，改协议时 locality 落在 parser 与 codec 同处一个目录上。
 */

/** `#n` 后缀：occurrence 的编码；按**最后一个** `#` 切分，base 自身可含 `#` */
const OCCURRENCE_RE = /^(.*)#([1-9][0-9]*)$/

/**
 * 给 base 加上 occurrence 后缀；**occurrence 为 1 时不带后缀**——这条规则只写在这里。
 * `occurrence` 基数为 1（parser 的计数器口径），缺省即 1。
 */
export function withOccurrence(base: string, occurrence = 1): string {
  return occurrence <= 1 ? base : `${base}#${occurrence}`
}

/**
 * 拆出 base 与 occurrence；缺失后缀时为 1（与 `withOccurrence` 互为逆运算）。
 * 不像 occurrence 的后缀（`#0`、`#01`、`#` 结尾）原样留在 base 里。
 */
export function splitOccurrence(id: string): { base: string; occurrence: number } {
  const m = OCCURRENCE_RE.exec(id)
  return m === null ? { base: id, occurrence: 1 } : { base: m[1], occurrence: Number(m[2]) }
}

/** `<prefix>:<key>` 形态的编码与解码；两类前缀各自的 key 名不同，故只共用实现不共用名字 */
function keyed(prefix: string, key: string, occurrence = 1): string {
  return withOccurrence(`${prefix}:${key}`, occurrence)
}

function parseKeyed(prefix: string, id: string): { key: string; occurrence: number } | null {
  const head = `${prefix}:`
  if (!id.startsWith(head)) return null
  const { base, occurrence } = splitOccurrence(id)
  const key = base.slice(head.length)
  return key === '' ? null : { key, occurrence }
}

// ---------- flowchart ----------

/** 节点出现（`node:A` / `node:A#2`）：同一节点 id 的第 n 次出现 */
export function nodeElementId(nodeId: string, occurrence = 1): string {
  return keyed('node', nodeId, occurrence)
}

export function parseNodeElementId(id: string): { nodeId: string; occurrence: number } | null {
  const parsed = parseKeyed('node', id)
  return parsed === null ? null : { nodeId: parsed.key, occurrence: parsed.occurrence }
}

/** 连线出现（`link:A:B` / `link:A:B#2`）：同一对节点间的第 n 条连线 */
export function linkElementId(from: string, to: string, occurrence = 1): string {
  return withOccurrence(`link:${from}:${to}`, occurrence)
}

// ---------- sequence ----------

/** 参与者声明（`participant:B` / `participant:B#2`）：同名的第 n 条声明 */
export function participantElementId(actorId: string, occurrence = 1): string {
  return keyed('participant', actorId, occurrence)
}

export function parseParticipantElementId(
  id: string,
): { actorId: string; occurrence: number } | null {
  const parsed = parseKeyed('participant', id)
  return parsed === null ? null : { actorId: parsed.key, occurrence: parsed.occurrence }
}

// ---------- class ----------

/** 类声明（`class:Foo` / `class:Foo#2`） */
export function classElementId(name: string, occurrence = 1): string {
  return keyed('class', name, occurrence)
}

export function parseClassElementId(id: string): { name: string; occurrence: number } | null {
  const parsed = parseKeyed('class', id)
  return parsed === null ? null : { name: parsed.key, occurrence: parsed.occurrence }
}

/** namespace 声明（`namespace:Shapes` / `namespace:Shapes#2`） */
export function namespaceElementId(name: string, occurrence = 1): string {
  return keyed('namespace', name, occurrence)
}

export function parseNamespaceElementId(id: string): { name: string; occurrence: number } | null {
  const parsed = parseKeyed('namespace', id)
  return parsed === null ? null : { name: parsed.key, occurrence: parsed.occurrence }
}

/** classDef 声明（`classdef:emphasis` / `classdef:emphasis#2`）；class 与 flowchart 共用同一形态 */
export function classDefElementId(name: string, occurrence = 1): string {
  return keyed('classdef', name, occurrence)
}

export function parseClassDefElementId(id: string): { name: string; occurrence: number } | null {
  const parsed = parseKeyed('classdef', id)
  return parsed === null ? null : { name: parsed.key, occurrence: parsed.occurrence }
}

// ---------- mindmap ----------

/**
 * mindmap 节点（`mindmap-node:N`）：按源码顺序 1 基编号，没有 occurrence
 * （mermaid 的 DOM id `node_{N-1}` 与之对应，见 `canvas-selection/mindmap-adapter.ts`）。
 */
export function mindmapNodeElementId(ordinal: number): string {
  return `mindmap-node:${ordinal}`
}

export function parseMindmapNodeElementId(id: string): number | null {
  const m = /^mindmap-node:([1-9][0-9]*)$/.exec(id)
  return m === null ? null : Number(m[1])
}
