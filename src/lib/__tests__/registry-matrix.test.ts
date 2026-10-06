import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_LIST,
  type AnyDiagramTypeRegistration,
} from '../diagram-registry'
import { selectionFormsOf } from '../../components/selection-form-routes'
import { ensureZenumlRegistered } from '../zenuml-registration'
import { getGoldenCorpusEntry } from '../golden-corpus'
import { enDict, zhDict } from '../../i18n'

/**
 * 矩阵测试（self-grill-hardening 工单 04）：工单 03 的运行时兜底。
 *
 * 03 在**类型层**把「七件套」钉死（`DiagramTypeRegistration` 泛型 + 注册表 `satisfies` +
 * 穷尽断言），但类型层管不住运行期被抹掉的值（`undefined` 被塞进 `any`、模块挂载顺序、
 * 跨层槽位）。本文件对**同一张清单**（`DIAGRAM_TYPE_LIST`）做运行期断言：
 *
 * 1. 遍历全部注册项，逐件断言 parser / buildProjection / tree / canvas / menu / labelKey
 *    存在且可调用（类型 + arity），表单一件套（forms 表）有该 id 的条目；
 * 2. 每图种的起步模板通过真实 `mermaid.parse`（zenuml 先注册外部插件）；
 * 3. `labelKey === \`newDiagram.${id}\`` 且 zh / en 双字典都收录该键；
 * 4. **负向用例**：把同一断言助手跑在「克隆后删掉一件」的注册项上，断言它变红，
 *    且失败信息指名图种与件套——证明第 1 条不是空转。
 *
 * 失败信息一律形如 `图种「<id>」缺件套：<件套列表>`，直接指出哪种图缺哪一件。
 *
 * zenuml 是外部图种（`@mermaid-js/mermaid-zenuml`）：其起步模板的 parse 依赖插件注册，
 * 在 Node 26 环境当前因全局 `localStorage` 遮蔽 happy-dom 而加载失败（见工单 Notes）。
 * 本测试**不跳过 zenuml**——按「插件可加载」写断言；环境修复（vitest setup 文件）落地后
 * 该用例自然转绿，现状是 blocked-on-env-fix 而非被绕过。
 */

/** 七件套的件套名（负向用例逐件删除时用） */
const PIECES = [
  'parser',
  'buildProjection',
  'tree',
  'canvas',
  'menu',
  'labelKey',
  'forms',
] as const
type Piece = (typeof PIECES)[number]

/** 画布能力包必须齐备的成员（与 `CanvasCapabilities` 接口逐字对应） */
const CANVAS_MEMBERS = [
  'dataIdResolver',
  'toSelection',
  'canvasIdOf',
  'navigationIds',
  'keyboardProjection',
  'resolveSelection',
  'deleteIntent',
  'keyHandler',
] as const

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

/**
 * 断言一个注册项七件套齐备且可调用；缺任一件即抛出，消息指名图种与件套。
 * 正向测试对 `DIAGRAM_TYPE_LIST` 逐项调用；负向测试对「克隆后删一件」的注册项调用，
 * 断言它抛出——同一个助手，保证负向用例覆盖的正是正向断言。
 */
function assertRegistrationComplete(registration: AnyDiagramTypeRegistration): void {
  const id = registration.id
  const missing: string[] = []

  // 1. parser：parse(source) / resolveRewrites(doc, intent)
  const parser = asRecord(registration.parser)
  if (typeof parser?.parse !== 'function' || (parser.parse as (...a: unknown[]) => unknown).length !== 1) {
    missing.push('parser.parse')
  }
  if (
    typeof parser?.resolveRewrites !== 'function' ||
    (parser.resolveRewrites as (...a: unknown[]) => unknown).length !== 2
  ) {
    missing.push('parser.resolveRewrites')
  }

  // 2. buildProjection(doc)
  if (
    typeof registration.buildProjection !== 'function' ||
    (registration.buildProjection as (...a: unknown[]) => unknown).length !== 1
  ) {
    missing.push('buildProjection')
  }

  // 3. tree(projection, ctx)
  if (typeof registration.tree !== 'function' || (registration.tree as (...a: unknown[]) => unknown).length !== 2) {
    missing.push('tree')
  }

  // 4. canvas：八个能力成员全是函数
  const canvas = asRecord(registration.canvas)
  for (const member of CANVAS_MEMBERS) {
    if (typeof canvas?.[member] !== 'function') missing.push(`canvas.${member}`)
  }

  // 5. menu：blankItems 是数组、nodeItems 是对象
  const menu = asRecord(registration.menu)
  if (!Array.isArray(menu?.blankItems)) missing.push('menu.blankItems')
  if (asRecord(menu?.nodeItems) === undefined) missing.push('menu.nodeItems')

  // 6. labelKey：模板字面量 `newDiagram.<id>`
  if (registration.labelKey !== `newDiagram.${id}`) missing.push('labelKey')

  // 7. forms：路由表在 selection-form-routes 模块加载时挂入；须有 render 函数
  const forms = asRecord(registration.forms)
  if (typeof forms?.render !== 'function') missing.push('forms')

  if (missing.length > 0) {
    throw new Error(`图种「${id}」缺件套：${missing.join('、')}`)
  }
}

/** 克隆一个注册项并删掉指定件套（负向用例的输入；只读原项不受影响） */
function stripPiece(registration: AnyDiagramTypeRegistration, piece: Piece): AnyDiagramTypeRegistration {
  const clone = { ...(registration as unknown as Record<string, unknown>) }
  delete clone[piece]
  return clone as unknown as AnyDiagramTypeRegistration
}

describe('七件套矩阵：每图种逐件断言（件套齐备且可调用）', () => {
  for (const registration of DIAGRAM_TYPE_LIST) {
    it(`${registration.id} 七件套齐备且可调用`, () => {
      // 件套齐备（失败信息指名图种与缺哪件）
      expect(() => assertRegistrationComplete(registration)).not.toThrow()

      // 可调用：起步模板 → 解析 → 投影 → 结构树 / 画布 / 表单路由
      const parsed = registration.parser.parse(registration.template)
      expect(parsed.ok, `${registration.id} 起步模板解析失败`).toBe(true)
      if (!parsed.ok) return

      const projection = registration.buildProjection(parsed.doc)
      expect(projection.type, `${registration.id} 投影包装 type 与 id 不同名`).toBe(registration.id)

      const sections = registration.tree(projection, { t: (key) => key })
      expect(Array.isArray(sections), `${registration.id} tree 未返回分区数组`).toBe(true)

      const caps = registration.canvas
      expect(Array.isArray(caps.navigationIds(projection)), `${registration.id} canvas.navigationIds`).toBe(true)
      expect(caps.keyboardProjection(projection).kind, `${registration.id} canvas.keyboardProjection`).toBe(
        registration.id,
      )

      // 表单一件套：挂载后的 forms 槽位即 SELECTION_FORMS[id]（selection-form-routes 的表）
      expect(registration.forms, `${registration.id} 缺表单路由`).toBeDefined()
      expect(selectionFormsOf(projection), `${registration.id} 表单路由表无该 id 条目`).toBe(registration.forms)
    })
  }

  it('覆盖全部已注册图种（防矩阵空转）', () => {
    expect(DIAGRAM_TYPE_LIST.length).toBeGreaterThan(0)
    // 每个注册项的 id 都在 DIAGRAM_TYPES 查表命中同一实例
    for (const registration of DIAGRAM_TYPE_LIST) {
      expect(DIAGRAM_TYPES[registration.id]).toBe(registration)
    }
  })
})

describe('起步模板：每图种通过真实 mermaid.parse', () => {
  for (const registration of DIAGRAM_TYPE_LIST) {
    it(`${registration.id} 起步模板可被 mermaid.parse`, async () => {
      // 外部渲染器图种（zenuml）：先注册插件再 parse——不跳过、不绕开
      if (getGoldenCorpusEntry(registration.id)?.external === true) {
        await ensureZenumlRegistered()
      }
      await expect(mermaid.parse(registration.template)).resolves.toBeTruthy()
    })
  }
})

describe('i18n 键：labelKey 与 zh / en 双字典', () => {
  for (const registration of DIAGRAM_TYPE_LIST) {
    it(`${registration.id} 的 labelKey 与字典键一致`, () => {
      expect(registration.labelKey, `${registration.id} labelKey 拼写`).toBe(`newDiagram.${registration.id}`)
      const zhNew = zhDict.app.newDiagram as Record<string, string>
      const enNew = enDict.app.newDiagram as Record<string, string>
      expect(zhNew[registration.id], `zh 字典缺 ${registration.labelKey}`).toBeTypeOf('string')
      expect(enNew[registration.id], `en 字典缺 ${registration.labelKey}`).toBeTypeOf('string')
    })
  }
})

describe('负向：模拟漏接一件时同一断言助手变红（证明矩阵不空转）', () => {
  const base = DIAGRAM_TYPES.flowchart

  for (const piece of PIECES) {
    it(`移除 ${piece} 时断言失败并指名图种与件套`, () => {
      const broken = stripPiece(base, piece)
      // 同一助手：正反两面共用，负向覆盖的正是正向所断言的件套
      expect(() => assertRegistrationComplete(broken)).toThrowError(/flowchart/)
      expect(() => assertRegistrationComplete(broken)).toThrowError(new RegExp(piece))
      // 正向基线不红（对照：证明变红来自被删的那一件）
      expect(() => assertRegistrationComplete(base)).not.toThrow()
    })
  }

  it('失败信息形如「图种「id」缺件套：…」', () => {
    const broken = stripPiece(base, 'canvas')
    expect(() => assertRegistrationComplete(broken)).toThrowError(/^图种「flowchart」缺件套：canvas\./)
  })
})
