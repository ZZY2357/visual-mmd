/**
 * 连线位置序寻址的 **DOM 适配层**（工单 02，与 `editing/canvas-measure.ts` 同层）。
 *
 * 位置序身份（`relation:1` / `message:2` / `note:1` / `block:1`，见 `edge-identity.ts`）要能落到
 * DOM 上才能点选：本模块负责两件事——
 *  1. **标注**：渲染产物注入后，把身份写进连线的 `data-id`，让既有的点击链路
 *     （`data-id.ts` 的 selectionFromEventTarget → resolver）、高亮（`highlight.ts`）、
 *     命中区（`edge-hit-area.ts`）原样生效，**不改动共享谓词**。
 *  2. **命中**：沿**真实路径采样**（`getTotalLength` + `getPointAtLength` + `getScreenCTM`）
 *     找屏幕坐标附近的连线。**禁止用 `getBoundingClientRect().中心`**——class 斜线的 bbox
 *     会退化（实测 `x=651 y=332 w=36 h=13`，中点在 `elementFromPoint` 下命中 `<svg>` 根）。
 *
 * 为什么位置序 = **文档序**：mermaid 渲染连线时按源码顺序产出元素（实测 class 的
 * `.edgePaths > path` 与 `g.edgeLabels`、sequence 的 messageLine 元素都与投影同序），
 * 因此「文档序里的第 k 个候选」即「源码里的第 k 条」——这正是 ADR-0012 要的位置序，
 * 且**不含** mermaid 会重排的全局计数器。
 * （同一关系在渲染产物里可能出现多个相邻 path：工单 01 的命中克隆就会插一个，克隆带
 * `data-vm-hit` 且无 `id`；本模块排除克隆，并对相邻同值 path 去重——两种结构都成立。）
 *
 * **绝不误归属**：每个种类的候选数与投影条数不一致时，该种类整体放弃标注（保持「点不到」
 * 而不是「点到错的」）。因此本模块只做纯 DOM 读取 + 幂等写入，可在 happy-dom 里用假结构单测。
 */
import { edgeElementIdOf, isEdgeElementId, type EdgeIdentityKind } from './edge-identity'

/** 工单 01 的连线命中克隆标记；克隆不可参与数位置序（否则序号会数歪） */
const HIT_MARK = 'data-vm-hit'

/** class 关系边：`.edgePaths` 内每条关系一个 path（实测：mermaid 每条只渲染 1 个；
 * 工单 01 的命中克隆会再插一个相邻无 id 的副本，故排除克隆） */
const CLASS_RELATION_PATH = `.edgePaths > path:not([${HIT_MARK}])`

/** class 标签 / 基数容器：直接子元素按「每条关系一个 label 组（若有），紧随其 terminals 组（若有）」排列 */
const CLASS_LABEL_CHILDREN = 'g.edgeLabels > *'

/** sequence 消息线：普通消息是 line，自消息是 path（实测 class 名同为 messageLine0/1） */
const SEQUENCE_MESSAGE =
  'line[class~="messageLine0"], line[class~="messageLine1"], path[class~="messageLine0"], path[class~="messageLine1"]'

/** sequence 注释：rect.note 的宿主 g 即注释整体 */
const SEQUENCE_NOTE_RECT = 'rect.note'

/** sequence 块：line.loopLine 的宿主 g 即块整体（标签、边框都在其中；块内部空白不属于任何元素） */
const SEQUENCE_BLOCK_LINE = 'line.loopLine'

/**
 * 一条 class 关系在渲染产物里的「组」期望（由投影算出，见 `relationShapesOf`）。
 * mermaid 只在关系**有标签或有基数**时才产出 label 组（无标签但有基数时是空 label 组），
 * 有任一基数时才产出 terminals 组。
 */
export interface RelationShape {
  labelGroup: boolean
  terminalsGroup: boolean
}

/** 投影关系（结构性入参，避免耦合投影类型）→ 渲染期望序列 */
export function relationShapesOf(
  relations: ReadonlyArray<{ label: string | null; cardFrom: string | null; cardTo: string | null }>,
): RelationShape[] {
  return relations.map((r) => {
    const hasCards = r.cardFrom !== null || r.cardTo !== null
    return { labelGroup: r.label !== null || hasCards, terminalsGroup: hasCards }
  })
}

/** 文档序相邻同值去重：同一关系若出现多个相邻重复 path（命中克隆等）只算一条 */
function groupRepeats(elements: readonly Element[]): Element[][] {
  const groups: Element[][] = []
  for (const el of elements) {
    const key = el.getAttribute('data-id')
    const last = groups[groups.length - 1]
    if (last !== undefined && last[0].getAttribute('data-id') === key) last.push(el)
    else groups.push([el])
  }
  return groups
}

/** 文档序锚点 → 位置序身份；锚点数与投影条数不符则整体放弃（绝不误标） */
function annotateAnchors(anchors: readonly Element[], kind: EdgeIdentityKind, expected: number): void {
  if (expected <= 0 || anchors.length !== expected) return
  anchors.forEach((el, ordinal) => {
    const elementId = edgeElementIdOf(kind, ordinal)
    if (elementId !== null) el.setAttribute('data-id', elementId)
  })
}

/** 块 / 注释的锚点：命中元素（line.loopLine / rect.note）的宿主 g，去重且保持文档序 */
function hostGroupsOf(matches: readonly Element[]): Element[] {
  const seen = new Set<Element>()
  const out: Element[] = []
  for (const el of matches) {
    const host = el.parentElement
    if (host === null || seen.has(host)) continue
    seen.add(host)
    out.push(host)
  }
  return out
}

/**
 * class：标注关系边、标签组、基数组。
 * - 关系边按 `.edgePaths > path` 的相邻去重分组，第 k 组 = `relation:(k+1)`；
 * - 标签/基数按投影算出的期望序列逐位比对，**完全相符才标**，不符则整体放弃
 *   （mermaid 升版改结构时最多退化为「点不到标签」，不会点错关系）。
 */
export function annotateClassRelationIdentities(root: ParentNode, relations: readonly RelationShape[]): void {
  if (relations.length === 0) return

  const groups = groupRepeats(Array.from(root.querySelectorAll(CLASS_RELATION_PATH)))
  if (groups.length === relations.length) {
    groups.forEach((group, ordinal) => {
      const elementId = edgeElementIdOf('relation', ordinal)
      if (elementId === null) return
      for (const path of group) path.setAttribute('data-id', elementId)
    })
  }

  // 逐条关系列出期望消费的 g.edgeLabels 直接子元素（label 组 → 本条关系的标签；
  // terminals 组 → 本条关系的基数）。**按关系数而不是按子元素数**推位置序：
  // 无标签无基数的关系不产出子元素，但它的位置序仍然占位。
  const plan: Array<{ token: 'label' | 'terminals'; ordinal: number }> = []
  for (let ordinal = 0; ordinal < relations.length; ordinal++) {
    const shape = relations[ordinal]
    if (shape.labelGroup) plan.push({ token: 'label', ordinal })
    if (shape.terminalsGroup) plan.push({ token: 'terminals', ordinal })
  }
  const children = Array.from(root.querySelectorAll(CLASS_LABEL_CHILDREN))
  if (children.length !== plan.length) return
  // 先全校验再写：避免中途发现不符却已标了一半
  const matched = children.every((child, i) =>
    plan[i].token === 'label' ? child.classList.contains('edgeLabel') : child.classList.contains('edgeTerminals'),
  )
  if (!matched) return
  children.forEach((child, i) => {
    const elementId = edgeElementIdOf('relation', plan[i].ordinal)
    if (elementId !== null) child.setAttribute('data-id', elementId)
  })
}

/** sequence：标注消息线 / 注释 / 块（各自按投影顺序编号，条数不符的种类整体放弃） */
export function annotateSequenceIdentities(
  root: ParentNode,
  counts: { messages: number; notes: number; blocks: number },
): void {
  annotateAnchors(Array.from(root.querySelectorAll(SEQUENCE_MESSAGE)), 'message', counts.messages)
  annotateAnchors(hostGroupsOf(Array.from(root.querySelectorAll(SEQUENCE_NOTE_RECT))), 'note', counts.notes)
  annotateAnchors(hostGroupsOf(Array.from(root.querySelectorAll(SEQUENCE_BLOCK_LINE))), 'block', counts.blocks)
}

/** 屏幕命中容差（CSS px）：sequence 消息线 only 1.5px 描边，给一点余量但不足以吃到空白 */
export const EDGE_HIT_TOLERANCE = 4

/** 屏幕坐标到元素路径的最短距离；无几何 API（未渲染 / 非几何元素）时返回 null */
function distanceToPath(el: Element, x: number, y: number): number | null {
  const geo = el as Partial<SVGGeometryElement>
  if (typeof geo.getTotalLength !== 'function' || typeof geo.getPointAtLength !== 'function') return null
  const ctm = typeof (el as SVGGraphicsElement).getScreenCTM === 'function' ? (el as SVGGraphicsElement).getScreenCTM() : null
  if (ctm === null || ctm === undefined) return null
  const total = geo.getTotalLength()
  if (!Number.isFinite(total) || total <= 0) return null
  // 采样步长 ~8 用户单位：曲线段足够密，长线也不会爆量
  const samples = Math.min(64, Math.max(8, Math.ceil(total / 8)))
  let min = Infinity
  for (let i = 0; i <= samples; i++) {
    const p = geo.getPointAtLength((total * i) / samples)
    const sx = ctm.a * p.x + ctm.c * p.y + ctm.e
    const sy = ctm.b * p.x + ctm.d * p.y + ctm.f
    const d = Math.hypot(sx - x, sy - y)
    if (d < min) min = d
  }
  return min
}

/**
 * 沿真实路径采样，返回屏幕坐标附近最近的连线位置序身份（elementId）；没有则 null。
 * 只认位置序身份：节点 id、mermaid 的 `id_A_B_1` / `i1` / `L_A_B_0` 一律不参与。
 */
export function hitTestEdgeIdentity(
  root: ParentNode,
  clientX: number,
  clientY: number,
  tolerance: number = EDGE_HIT_TOLERANCE,
): string | null {
  let best: { elementId: string; distance: number } | null = null
  for (const el of Array.from(root.querySelectorAll('[data-id]'))) {
    const elementId = el.getAttribute('data-id')
    if (elementId === null || !isEdgeElementId(elementId)) continue
    const distance = distanceToPath(el, clientX, clientY)
    if (distance === null || distance > tolerance) continue
    if (best === null || distance < best.distance) best = { elementId, distance }
  }
  return best === null ? null : best.elementId
}
