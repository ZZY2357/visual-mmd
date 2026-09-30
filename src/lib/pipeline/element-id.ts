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

// ---------- state（more-diagrams 工单 02） ----------

/** 状态声明（`state:Idle` / `state:Idle#2`）；仅被转移引用的隐式状态没有声明元素 */
export function stateElementId(name: string, occurrence = 1): string {
  return keyed('state', name, occurrence)
}

/** 状态描述行（`state-desc:Idle`）：`Idle : 描述` 那一行的元素 id */
export function stateDescElementId(name: string, occurrence = 1): string {
  return keyed('state-desc', name, occurrence)
}

// ---------- er（more-diagrams 工单 03） ----------

/** 实体声明（`entity:Car` / `entity:Car#2`）；仅被关系引用的隐式实体没有声明元素 */
export function erEntityElementId(name: string, occurrence = 1): string {
  return keyed('entity', name, occurrence)
}

// ---------- requirement（more-diagrams 工单 07） ----------

/**
 * requirement 块声明（`requirement:login` / 同名重复 `requirement:login#2`）与
 * element 块声明（`requirement-element:loginUI` / `…#2`）。
 *
 * element 块的前缀带图种名（不是裸 `element:`）：`element` 这个词在本仓库已是
 * 「画布选中 kind」（`CanvasElementSelection`）的名字，裸用会让「elementId = element:foo」
 * 与「画布选中 kind = element」在同一份日志/断点里无法区分。
 */
export function requirementBlockElementId(name: string, occurrence = 1): string {
  return keyed('requirement', name, occurrence)
}

export function parseRequirementBlockElementId(id: string): { name: string; occurrence: number } | null {
  const parsed = parseKeyed('requirement', id)
  return parsed === null ? null : { name: parsed.key, occurrence: parsed.occurrence }
}

export function requirementElemBlockElementId(name: string, occurrence = 1): string {
  return keyed('requirement-element', name, occurrence)
}

export function parseRequirementElemBlockElementId(id: string): { name: string; occurrence: number } | null {
  const parsed = parseKeyed('requirement-element', id)
  return parsed === null ? null : { name: parsed.key, occurrence: parsed.occurrence }
}

/** 字段行（`field:3`）：文档序 1 基编号，**跨块全局计数**（与 parser 计数器一致）。
 * 字段按「所属块 + 字段名」寻址（`set-requirement-field`），故只需编码。 */
export function requirementFieldElementId(ordinal: number): string {
  return `field:${ordinal}`
}

// ---------- 下一个可用名/ID（architecture-deepening-2 工单 04） ----------

export interface NextFreeNameOptions {
  /**
   * 冲突语义（architecture-deepening-2 工单 04）：
   * - `true`（默认）：base 是**可引用名**（类名 / 参与者 id / 图表库条目名）——重名会让
   *   后续引用连带漂移，新建必须避重，从 base 本身查起：base、base2、base3……
   * - `false`：base 是**生成式 id 的前缀**（flowchart 的 `n`）——id 无引用语义，
   *   从 1 起编号即可：n1、n2、n3……
   */
  referential?: boolean
  /** base 与编号之间的分隔符（缺省直接拼接；图表库条目名用 `' '`） */
  separator?: string
}

/**
 * 「下一个可用名/ID」的唯一实现（architecture-deepening-2 工单 04）：
 * 全库的新建命名——class / sequence 的可引用名（右键菜单）、flowchart 的生成式节点 id
 * （画布键盘）、图表库条目名（store）——都经由本函数，编号口径只写这一处。
 *
 * 放在元素 ID codec 同层：它与 `withOccurrence` 同属「身份的编号规则」，都是
 * 生成端与消费端必须一致的纯函数，改口径时 locality 落在同一文件。
 */
export function nextFreeName(
  base: string,
  used: Iterable<string>,
  opts: NextFreeNameOptions = {},
): string {
  const taken = new Set(used)
  const referential = opts.referential !== false
  const separator = opts.separator ?? ''
  if (referential && !taken.has(base)) return base
  for (let i = referential ? 2 : 1; ; i++) {
    const candidate = `${base}${separator}${i}`
    if (!taken.has(candidate)) return candidate
  }
}
