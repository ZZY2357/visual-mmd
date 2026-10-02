// eventmodeling 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { EventModelingIntent } from './eventmodeling'
import type { EventModelingProjection } from '../projection/eventmodeling-projection'
import type { Selection } from '../projection/selection'

// ---------- eventmodeling 编辑键（more-diagrams 工单 28 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（eventmodeling）：帧（位置序 `frame:N`）与数据块（位置序
 * `data:N`）各映射到既有 delete-* 意图；派生连线（`relation:N`）**无源码语句、只读**
 * （research §3/§8.4：默认推断关系不可手术改写）→ 不可删，安静返回 null；文档级
 * 声明行（entity / note / gwt）不进选中面。已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function eventModelingDeleteIntent(
  projection: EventModelingProjection,
  selection: Selection | null,
): EventModelingIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'em-frame':
      return projection.frames.some((f) => f.elementId === selection.elementId)
        ? { type: 'delete-em-frame', elementId: selection.elementId }
        : null
    case 'em-data':
      return projection.dataBlocks.some((d) => d.elementId === selection.elementId)
        ? { type: 'delete-em-data', elementId: selection.elementId }
        : null
    // 派生连线无源码语句（只读）——不可删
    case 'em-relation':
    default:
      return null
  }
}

/** 下一个可用帧号（1–3 位；从 1 起取第一个未被占用的十进制） */
function nextEmFrameId(used: Iterable<string>): string {
  const taken = new Set(used)
  for (let n = 1; ; n++) {
    const id = String(n)
    if (!taken.has(id)) return id
  }
}

/**
 * 键 → plan（eventmodeling，工单 28 / ADR-0013 就近类比，工单定案）：
 * - Delete = 删除选中元素（查 eventModelingDeleteIntent 唯一映射；帧 / 数据块，派生连线不可删）
 * - 选中帧上 Tab = 在**同泳道**追加一个新帧（`tf <nextId> <同类型> <同命名空间>.NewFrame`，
 *   落在选中帧之后；帧号由 nextEmFrameId 避重、标识避重同命名空间）——EM 的「同泳道下一条」
 *   即模型上「同一实体类型的下一帧」，与 cynefin 条目同构的就近类比
 * - 选中帧上 Enter = 追加一个新**事件**帧（`evt`，跨泳道落 Events；与 usecase 的
 *   「Tab 加同级一类 / Enter 加另一类」同构）
 * - 选中数据块上 Tab = 追加一个新数据块（`data <nextName> {` + 空体），标识避重
 * - 不做内联编辑：画布 DOM 无 data-id（research §4/§8.3 实测）→ 键操作实际从结构树
 *   选中后经画布键盘生效；新名字 / 帧号用占位并避重，命名交给结构树 / 属性表单
 *   （与 cynefin / ishikawa / treemap 无画布寻址降级同口径）
 */
export function eventModelingKeyPlan(
  projection: EventModelingProjection,
  input: KeyInput,
): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = eventModelingDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null) return null

  if (selection.kind === 'em-frame') {
    const frame = projection.frames.find((f) => f.elementId === selection.elementId)
    if (frame === undefined) return null
    const usedFrames = projection.frames.map((f) => f.frameId)
    // 同命名空间下避重标识（EM 标识全局共享命名空间）
    const usedIdentifiers = projection.frames
      .filter((f) => f.namespace === frame.namespace)
      .map((f) => f.name)
    const frameId = nextEmFrameId(usedFrames)
    if (input.key === 'Enter') {
      // Enter = 追加新事件帧（跨泳道落 Events）
      const name = nextFreeName('NewEvent', usedIdentifiers)
      const identifier = frame.namespace === '' ? name : `${frame.namespace}.${name}`
      return {
        intents: [
          {
            type: 'add-em-frame',
            frameId,
            entityType: 'evt',
            entityIdentifier: identifier,
            afterElementId: frame.elementId,
          } satisfies EventModelingIntent,
        ],
        newElementTarget: { selection: { kind: 'em-frame', elementId: `frame:${projection.frames.length + 1}` } },
      }
    }
    // Tab = 同泳道追加同类型帧
    const name = nextFreeName('NewFrame', usedIdentifiers)
    const identifier = frame.namespace === '' ? name : `${frame.namespace}.${name}`
    return {
      intents: [
        {
          type: 'add-em-frame',
          frameId,
          entityType: frame.entityType,
          entityIdentifier: identifier,
          afterElementId: frame.elementId,
        } satisfies EventModelingIntent,
      ],
      newElementTarget: { selection: { kind: 'em-frame', elementId: `frame:${projection.frames.length + 1}` } },
    }
  }

  if (selection.kind === 'em-data') {
    if (input.key !== 'Tab') return null
    const name = nextFreeName('Data', projection.dataBlocks.map((d) => d.name))
    return {
      intents: [{ type: 'add-em-data', name } satisfies EventModelingIntent],
      newElementTarget: { selection: { kind: 'em-data', elementId: `data:${projection.dataBlocks.length + 1}` } },
    }
  }

  return null
}
