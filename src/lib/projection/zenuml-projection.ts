import type { SourceDocument } from '../pipeline/document'
import {
  isValidZenumlId,
  type ZenumlAnnotationData,
  type ZenumlFragmentData,
  type ZenumlMessageData,
  type ZenumlParticipantData,
  type ZenumlTitleData,
} from '../pipeline/zenuml'
import type { Selection } from './selection'

/**
 * zenuml 投影（more-diagrams 工单 19，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - 参与者 = **名字即身份**（`participant:<id>`，ADR-0012——mermaid/zenuml 按名引用，
 *   重名即同一参与者；隐式参与者（仅出现在消息端点、无 `participant` 声明行）不落码，
 *   投影按消息端点**合成**并在 `declared: false` 标注）。
 * - 消息 = **位置序身份**（`message:N`，1 基文档序，ADR-0012——消息无显式 id，位置序唯一稳定）。
 * - 片段 = **位置序身份**（`fragment:N`，1 基文档序——开行为分组锚点）。片段是**分组**，
 *   结构树里作为容器；片体内消息 / 嵌套片段**展平**进消息 / 片段序列（保留 `parentFragmentId`）。
 *
 * 画布 DOM **不可寻址**（工单 19 任务 0 实测：zenuml 渲染产物无 `data-id` / 无 `id`，
 * 唯一 data 属性 `data-participant` 不成稳定映射）——见 zenuml-adapter，画布点选整体降级。
 */

/** 参与者（显式声明或由消息端点隐式合成） */
export interface ProjectionZenumlParticipant {
  /** 元素 id：`participant:<id>`（名字即身份）+ 编辑意图寻址键 */
  elementId: string
  /** 参与者标识符（消息端点引用的名字） */
  id: string
  /** 显示别名（`as "…"` 原文剥引号；无别名为 null，展示回落 id） */
  alias: string | null
  /** 注解（`@Actor` / `@Database` …；无注解为 null） */
  annotation: string | null
  /** true = 有显式 `participant` 声明行；false = 仅由消息端点隐式引入 */
  declared: boolean
}

/** 消息（同步 / 异步 / 创建 / 返回）：位置序身份 `message:N` */
export interface ProjectionZenumlMessage {
  /** `message:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 1 基文档序 */
  ordinal: number
  /** 消息种类 */
  messageKind: 'sync' | 'async' | 'new' | 'return'
  /** 发起方标识符（`return` 为 null——无发起端点） */
  from: string | null
  /** 接收方标识符（`new` 为构造出的类名；`return` 为 null） */
  to: string | null
  /** 方法名 / 类名 / `return` 关键字 */
  method: string
  /** 参数原文（含括号；无参数为 null） */
  argsRaw: string | null
  /** 显示文本（`<from>.<method>` / `<from>-><to>.<method>` / `new A` / `return x`） */
  label: string
  /** 赋值前缀原文（`const r = ` 等；无赋值前缀为 ''） */
  assignPrefix: string
  /** 所属片段 elementId（`fragment:N`；顶层为 null） */
  parentFragmentId: string | null
}

/** 片段（分组）：位置序身份 `fragment:N` */
export interface ProjectionZenumlFragment {
  /** `fragment:N`，位置序身份 + 树选中键 */
  elementId: string
  /** 1 基文档序 */
  ordinal: number
  /** 关键字（`if` / `else` / `else if` / `while` / `for` / `forEach` / `loop` / `opt` / `par` /
   *  `try` / `catch` / `finally`） */
  keyword: string
  /** 条件原文（如 `(x)`；无条件的 `opt {` 为 ''） */
  condition: string
  /** 所属外层片段 elementId（嵌套片段；顶层为 null） */
  parentFragmentId: string | null
  /** 片体内直接消息数（不含嵌套片段的） */
  directMessageCount: number
}

export interface ZenumlProjection {
  /** 全部参与者（文档序：显式声明顺序 + 消息端点首次出现顺序补合成） */
  participants: ProjectionZenumlParticipant[]
  /** 全部消息（文档序，`message:N`） */
  messages: ProjectionZenumlMessage[]
  /** 全部片段（文档序，`fragment:N`） */
  fragments: ProjectionZenumlFragment[]
  /** 文档标题（`title <text>`；无标题为 null） */
  title: string | null
  /** 下一个消息序号（= 消息总数 + 1，仅文档末尾追加时准） */
  nextMessageOrdinal: number
  /** 下一个片段序号（= 片段总数 + 1） */
  nextFragmentOrdinal: number
}

/** 剥引号（`"…"` / `'…'`；裸词原样返回） */
function stripQuote(raw: string): string {
  const m = /^["']([\s\S]*)["']$/.exec(raw)
  return m !== null ? m[1] : raw
}

/** 消息显示文本 */
function messageLabel(data: ZenumlMessageData): string {
  if (data.messageKind === 'new') return `new ${data.method}`
  if (data.messageKind === 'return') return `return${data.argsRaw ?? ''}`
  const call =
    data.operator === '->'
      ? `${data.from}->${data.to}${data.method !== '' ? `.${data.method}` : ''}`
      : `${data.from}.${data.method}`
  return `${call}${data.argsRaw !== null ? '()' : ''}`
}

/** 从解析产物构建 zenuml 投影（纯函数，ADR-0016） */
export function buildZenumlProjection(doc: SourceDocument): ZenumlProjection {
  const participants: ProjectionZenumlParticipant[] = []
  const messages: ProjectionZenumlMessage[] = []
  const fragments: ProjectionZenumlFragment[] = []
  const byId = new Map<string, ProjectionZenumlParticipant>()
  const fragmentStack: ProjectionZenumlFragment[] = []
  let messageOrdinal = 0
  let fragmentOrdinal = 0

  // 注解行 `@Actor A`：先扫一遍建立 参与者 → 注解 映射
  const annotationOf = new Map<string, string>()
  for (const part of doc.elements) {
    if (part.element.kind !== 'zenuml-annotation') continue
    const ann = part.element as ZenumlAnnotationData
    const target = ann.target.trim()
    if (target !== '' && isValidZenumlId(target)) annotationOf.set(target, ann.annotation)
  }

  const ensureParticipant = (id: string): void => {
    if (id === '' || byId.has(id)) return
    const p: ProjectionZenumlParticipant = {
      elementId: `participant:${id}`,
      id,
      alias: null,
      annotation: annotationOf.get(id) ?? null,
      declared: false,
    }
    byId.set(id, p)
    participants.push(p)
  }

  // 首遍：显式参与者声明（保留文档序）
  for (const part of doc.elements) {
    if (part.element.kind !== 'zenuml-participant') continue
    const p = part.element as ZenumlParticipantData
    const participant: ProjectionZenumlParticipant = {
      elementId: `participant:${p.id}`,
      id: p.id,
      alias: p.aliasRaw !== null ? stripQuote(p.aliasRaw) : null,
      annotation: annotationOf.get(p.id) ?? null,
      declared: true,
    }
    byId.set(p.id, participant)
    participants.push(participant)
  }

  // 次遍：片段 / 消息（位置序身份）；片段内嵌按栈计 parentFragmentId
  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'zenuml-fragment') {
      const frag = data as ZenumlFragmentData
      fragmentOrdinal++
      const projection: ProjectionZenumlFragment = {
        elementId: `fragment:${fragmentOrdinal}`,
        ordinal: fragmentOrdinal,
        keyword: frag.keyword,
        condition: frag.conditionRaw.trim(),
        parentFragmentId: fragmentStack.length > 0 ? fragmentStack[fragmentStack.length - 1].elementId : null,
        directMessageCount: 0,
      }
      fragments.push(projection)
      fragmentStack.push(projection)
    } else if (data.kind === 'zenuml-fragment-end') {
      fragmentStack.pop()
    } else if (data.kind === 'zenuml-message') {
      const msg = data as ZenumlMessageData
      messageOrdinal++
      const parent = fragmentStack.length > 0 ? fragmentStack[fragmentStack.length - 1] : null
      if (parent !== null) parent.directMessageCount++
      if (msg.from !== null) ensureParticipant(msg.from)
      if (msg.to !== null) ensureParticipant(msg.to)
      messages.push({
        elementId: `message:${messageOrdinal}`,
        ordinal: messageOrdinal,
        messageKind: msg.messageKind,
        from: msg.from,
        to: msg.to,
        method: msg.method,
        argsRaw: msg.argsRaw,
        label: messageLabel(msg),
        assignPrefix: msg.assignPrefix,
        parentFragmentId: parent !== null ? parent.elementId : null,
      })
    }
  }

  const titleElement = doc.elements.find((p) => p.element.kind === 'zenuml-title')
  const title =
    titleElement !== undefined ? (titleElement.element as ZenumlTitleData).value : null

  return {
    participants,
    messages,
    fragments,
    title,
    nextMessageOrdinal: messages.length + 1,
    nextFragmentOrdinal: fragments.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveZenumlSelection(
  projection: ZenumlProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'zenuml-participant':
      return projection.participants.some((p) => p.elementId === selection.elementId) ? selection : null
    case 'zenuml-message':
      return projection.messages.some((m) => m.elementId === selection.elementId) ? selection : null
    case 'zenuml-fragment':
      return projection.fragments.some((f) => f.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
