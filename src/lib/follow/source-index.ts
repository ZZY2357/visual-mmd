import type { SourceDocument } from '../pipeline/document'
import type { Span } from '../pipeline/span'
import { detectDiagramType, type DiagramTypeId } from '../diagram-registry'
import type { Selection } from '../projection/selection'
import { selectionKey } from '../projection/selection'
import { splitOccurrence } from '../pipeline/element-id'

/**
 * 光标↔元素跟随的源码索引（self-grill-hardening 工单 16）。
 *
 * 解析器的 span 数据早已存在（`SourceDocument.elements` 的 `id + span`），缺的是把
 * 「选中 / 光标位置」与「源码区间」对上的桥。本模块是这座桥的唯一实现：
 *
 * - `elementIdFor(selection)`：选中 → 文档元素 id（selectionKey 索引，O(1)）。
 * - `selectionForElementId(id)`：文档元素 id → 选中。
 * - `selectionAtOffset(offset)`：字符偏移（光标）→ 落在其区间内的元素的选中。
 *
 * **覆盖范围（按图种，其余图种静默降级为空索引）**：flowchart / sequence / class /
 * mindmap / state / er —— 这些图种的解析产物元素 id 与其选中种类一一对应（名字即身份
 * 或位置序身份），无需投影参与即可在文档层反解。其余图种（含 more-diagrams 的各类）
 * 元素 id 与选中的对应关系依赖投影或不可寻址，本工单不做，跟随行为安静地不触发。
 *
 * 纯函数、无 DOM、无 React：可从 `SourceDocument` 独立测试。
 */

/** 跟随索引：双向查表 + 光标定位 + 区间查询 */
export interface FollowIndex {
  /** 选中 → 文档元素 id；无对应元素（未覆盖图种 / 不可寻址 kind）返回 null */
  elementIdFor(selection: Selection): string | null
  /** 文档元素 id → 选中；未知 id 返回 null */
  selectionForElementId(elementId: string): Selection | null
  /** 字符偏移落在某元素区间 [start, end) 内时返回该元素的选中；否则 null */
  selectionAtOffset(offset: number): Selection | null
  /** 选中的源码区间；无对应元素返回 null */
  spanOf(selection: Selection): Span | null
}

const EMPTY: FollowIndex = {
  elementIdFor: () => null,
  selectionForElementId: () => null,
  selectionAtOffset: () => null,
  spanOf: () => null,
}

export const EMPTY_FOLLOW_INDEX: FollowIndex = EMPTY

interface RangeEntry {
  start: number
  end: number
  selection: Selection
}/** 各图种解析产物 data.kind → 选中。类型不符 / 未覆盖的 kind 返回 null。 */
function selectionOfPart(
  typeId: DiagramTypeId,
  kind: string,
  elementId: string,
  data: Record<string, unknown>,
): Selection | null {
  switch (typeId) {
    case 'flowchart':
      switch (kind) {
        case 'node':
          return { kind: 'node', nodeId: String(data.nodeId) }
        case 'link':
          return {
            kind: 'edge',
            from: String(data.fromNodeId),
            to: String(data.toNodeId),
            occurrence: splitOccurrence(elementId).occurrence,
          }
        case 'subgraph-open':
          return { kind: 'subgraph', elementId }
        case 'classdef':
          return { kind: 'classdef', name: String(data.name) }
        default:
          return null
      }
    case 'sequence':
      switch (kind) {
        case 'participant':
          return { kind: 'participant', actorId: String(data.actorId) }
        case 'message':
          return { kind: 'message', elementId }
        case 'note':
          return { kind: 'note', elementId }
        case 'block-open':
        case 'block-else':
          return { kind: 'block', elementId }
        case 'rect-open':
        case 'box-open':
          return { kind: 'seq-region', elementId }
        default:
          return null
      }
    case 'class':
      switch (kind) {
        case 'class':
          return { kind: 'class', name: String(data.name) }
        case 'member':
          return { kind: 'class-member', elementId }
        case 'relation':
          return { kind: 'class-relation', elementId }
        case 'note':
          return { kind: 'class-note', elementId }
        case 'namespace':
          return { kind: 'class-namespace', elementId }
        default:
          return null
      }
    case 'mindmap':
      return kind === 'mindmap-node' ? { kind: 'mindmap-node', elementId } : null
    case 'state':
      switch (kind) {
        case 'state-decl':
        case 'state-desc':
          return { kind: 'state', id: String(data.id) }
        case 'state-transition':
          return { kind: 'state-transition', elementId }
        case 'state-note':
          return { kind: 'state-note', elementId }
        default:
          return null
      }
    case 'er':
      switch (kind) {
        case 'er-entity':
          return { kind: 'er-entity', name: String(data.name) }
        case 'er-attribute':
          return { kind: 'er-attribute', elementId }
        case 'er-relation':
          return { kind: 'er-relation', elementId }
        default:
          return null
      }
    default:
      return null
  }
}

/**
 * 从解析产物与图种 id 构建跟随索引。
 * 未覆盖图种 / 空文档 → `EMPTY_FOLLOW_INDEX`（全部查询返回 null，静默降级）。
 */
export function buildFollowIndex(typeId: DiagramTypeId, doc: SourceDocument): FollowIndex {
  const byKey = new Map<string, string>()
  const byId = new Map<string, Selection>()
  const spanByKey = new Map<string, Span>()
  const ranges: RangeEntry[] = []

  for (const part of doc.elements) {
    const data = part.element as unknown as Record<string, unknown>
    const selection = selectionOfPart(typeId, part.element.kind, part.id, data)
    if (selection === null) continue
    const key = selectionKey(selection)
    // 同一选中可能由多个元素表达（如 state 的声明行 + 描述行）：首个元素为准
    if (!byKey.has(key)) {
      byKey.set(key, part.id)
      spanByKey.set(key, part.span)
    }
    if (!byId.has(part.id)) byId.set(part.id, selection)
    ranges.push({ start: part.span.start, end: part.span.end, selection })
  }

  if (byId.size === 0) return EMPTY

  ranges.sort((a, b) => a.start - b.start)
  const sorted = ranges

  return {
    elementIdFor: (selection) => byKey.get(selectionKey(selection)) ?? null,
    selectionForElementId: (elementId) => byId.get(elementId) ?? null,
    selectionAtOffset: (offset) => {
      // 区间不重叠且已排序：线性扫足够（文档规模小），语义简单可测
      for (const range of sorted) {
        if (range.start > offset) return null
        if (offset >= range.start && offset < range.end) return range.selection
      }
      return null
    },
    spanOf: (selection) => spanByKey.get(selectionKey(selection)) ?? null,
  }
}

/**
 * 解析源码并构建跟随索引（含元素区间）。解析失败 / 图种未识别 → null（静默降级）。
 * 返回 doc 与 index，供「选中 → span」与「光标偏移 → 选中」两个方向共用一次解析。
 *
 * 单条缓存（源码字符串不变则复用上次结果）：光标方向每次防抖都要查索引，
 * 同一份源码下重复解析整个文档是浪费；源码一变缓存即失效，语义不变。
 */
let cachedSource: string | null = null
let cachedBuilt: { typeId: DiagramTypeId; index: FollowIndex; doc: SourceDocument } | null = null

export function buildSourceIndex(source: string): { typeId: DiagramTypeId; index: FollowIndex; doc: SourceDocument } | null {
  if (source === cachedSource) return cachedBuilt
  const registration = detectDiagramType(source)
  let built: { typeId: DiagramTypeId; index: FollowIndex; doc: SourceDocument } | null = null
  if (registration !== null) {
    const parsed = registration.parser.parse(source)
    if (parsed.ok) {
      built = { typeId: registration.id, index: buildFollowIndex(registration.id, parsed.doc), doc: parsed.doc }
    }
  }
  cachedSource = source
  cachedBuilt = built
  return built
}

/** 选中的源码区间：无对应元素 / 未覆盖图种 / 解析失败 → null */
export function spanOfSelection(source: string, selection: Selection): Span | null {
  const built = buildSourceIndex(source)
  return built?.index.spanOf(selection) ?? null
}

/** 字符偏移（光标）→ 该位置的选中：不在任何元素内 / 未覆盖图种 → null */
export function selectionAtSourceOffset(source: string, offset: number): Selection | null {
  const built = buildSourceIndex(source)
  return built?.index.selectionAtOffset(offset) ?? null
}
