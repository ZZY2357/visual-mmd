import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n, zhDict } from '../../i18n'
import { classParser } from '../../lib/pipeline/class'
import { buildClassProjection } from '../../lib/projection/class-projection'
import { nodeDataIdResolver, elementDataIdResolver, type CanvasSelection } from '../../lib/canvas-selection/data-id'
import { edgeSelectionOf } from '../../lib/canvas-selection/edge-adapter'
import { annotateClassRelationIdentities, relationShapesOf } from '../../lib/canvas-selection/edge-locate'
import { useCanvasSelection } from '../../lib/canvas-selection/use-canvas-selection'
import { useCanvasContextMenu, type NodeFormState } from '../../lib/editing/use-canvas-context-menu'
import type { Selection } from '../../lib/projection/selection'
import type { AnyProjection } from '../../lib/diagram-registry'
import { PropertyPanel } from '../PropertyPanel'
import { AddMemberInlineForm, AddRelationInlineForm } from '../class-forms'

/**
 * 验收场景 A 的**单测等价覆盖**（本轮未做真机端到端——用户指示跳过真机验收）。
 *
 * spec 场景 A 原文：加类 → 加两个成员 → 连到另一个类 → **双击线上标上 `1..*` 与标签** →
 * 点选这条线并在右侧改成 `*--`。
 *
 * 第四步按**工单 02 的裁定**改写（工单 09 记录该调整）：spec 的决策是「双击只用于 class 类名与
 * sequence 别名，连线不做内联编辑」，且基数文本从 `span` 到 `<svg>` 全程无 data-id；工单 02 据此
 * 把「点关系标签 / 点基数文本」裁定为**归属到边**（沿 DOM 向上命中该关系的位置序 data-id）。
 * 故实际路径为：**点选这条线（含点标签 / 点基数）→ 右侧 `RelationForm` 标基数与标签**。
 *
 * 覆盖的链路（全部是真实现，不 mock 画布接线）：
 * `annotateClassRelationIdentities`（渲染后标注位置序身份）→ `useCanvasSelection` 点击命中 →
 * `edgeSelectionOf`（与 `CanvasPanel.canvasToEditorSelection` 的 element 分支逐字同构）→
 * `PropertyPanel` 渲染真实 `RelationForm` → 表单改基数 / 标签 / 关系类型 → `commitIntent` 落码 →
 * `mermaid.parse` 通过（弱替代证据，代替真机渲染）。
 *
 * 加类 / 加成员 / 加关系三步走**真实 hook（useCanvasContextMenu）与真实表单**，
 * 与工单 04 的场景 B 等价覆盖同款手法。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

type ClassProjectionWrapper = Extract<AnyProjection, { type: 'class' }>

function projectionOf(source: string): ClassProjectionWrapper {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'class', class: buildClassProjection(parsed.doc) }
}

/** 图种 → data-id resolver（与 CanvasPanel.resolverOf 的 class 分支同约定） */
function resolverOf(projection: ClassProjectionWrapper) {
  const nodes = nodeDataIdResolver(projection.class.classes.map((c) => c.name))
  const edges = elementDataIdResolver(projection.class.relations.map((r) => r.elementId))
  return (dataId: string) => nodes(dataId) ?? edges(dataId)
}

/** 与 CanvasPanel.canvasToEditorSelection 的 class 分支逐字同构 */
function canvasToEditorSelection(
  projection: ClassProjectionWrapper,
  canvasSelection: CanvasSelection,
): Selection | null {
  if (canvasSelection.kind === 'element') return edgeSelectionOf(projection.type, canvasSelection.elementId)
  if (canvasSelection.kind === 'node') return { kind: 'class', name: canvasSelection.id }
  return null
}

/** 与 CanvasPanel.selectedDataIdOf 的 class 相关分支同构（高亮用） */
function selectedDataIdOf(selection: Selection | null): string | null {
  if (selection === null) return null
  if (selection.kind === 'class') return selection.name
  if (selection.kind === 'class-relation') return selection.elementId
  return null
}

/**
 * class 图 SVG 桩：与 mermaid v12 `classDiagram` 输出同构——
 * 节点 `<g data-id="类名">`、关系 `<g.edgePaths > path>`（mermaid 自带的 `id_源_目标_N`）、
 * 标签 / 基数容器 `<g.edgeLabels > g.edgeLabel / g.edgeTerminals>`。
 * 位置序身份在渲染后由 `annotateClassRelationIdentities` 标注上去。
 */
function svgOf(projection: ClassProjectionWrapper): string {
  const nodes = projection.class.classes.map((c) => `<g data-id="${c.name}"></g>`).join('')
  const rels = projection.class.relations
  const paths = rels
    .map((r, i) => `<path data-id="id_${r.from}_${r.to}_${i + 1}"></path>`)
    .join('')
  const shapes = relationShapesOf(rels)
  const labels = rels
    .map((r, i) => {
      const parts: string[] = []
      if (shapes[i].labelGroup) {
        parts.push(`<g class="edgeLabel"><span class="edgeLabel">${r.label ?? ''}</span></g>`)
      }
      if (shapes[i].terminalsGroup) {
        parts.push(
          `<g class="edgeTerminals"><foreignObject><span class="edgeLabel">"${r.cardFrom ?? ''}"</span></foreignObject></g>`,
        )
      }
      return parts.join('')
    })
    .join('')
  return `<svg class="classDiagram"><g class="nodes">${nodes}</g><g class="edgePaths">${paths}</g><g class="edgeLabels">${labels}</g></svg>`
}

interface MenuSnapshot {
  nodeForm: NodeFormState | null
  menuOpen: boolean
}

interface Api {
  addClass: () => void
  addMember: () => void
  addRelation: () => void
  /** 工单 05：连线菜单的编辑类菜单项（「在属性面板中编辑」） */
  editRelation: () => void
}

function Harness(props: {
  projection: ClassProjectionWrapper
  svg: string
  onState: (s: MenuSnapshot) => void
  apiRef: { current: Api | null }
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<HTMLDivElement | null>(null)
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: resolverOf(props.projection),
    containerRef: menuRef,
  })
  const selection = useEditorStore((s) => s.selection)
  const { onClick } = useCanvasSelection({
    svg: props.svg,
    resolver: resolverOf(props.projection),
    selectedDataId: selectedDataIdOf(selection),
    containerRef: svgRef,
    // 渲染后把位置序身份写到 path / 标签 / 基数上（与 CanvasPanel 的 annotateEdges 同源）
    annotateEdges: (root) => {
      annotateClassRelationIdentities(root, relationShapesOf(props.projection.class.relations))
    },
    onSelect: (canvasSelection) => {
      useEditorStore.getState().select(canvasToEditorSelection(props.projection, canvasSelection))
    },
  })
  props.apiRef.current = {
    // 工单 01：菜单动作经 ctx.onMenuItem 查 MENU_ACTIONS 表分发
    addClass: () => ctx.onMenuItem('add-class'),
    addMember: () => ctx.onMenuItem('add-member'),
    addRelation: () => ctx.onMenuItem('add-relation'),
    editRelation: () => ctx.onMenuItem('edit-relation'),
  }
  useEffect(() => {
    props.onState({ nodeForm: ctx.nodeForm, menuOpen: ctx.menu !== null })
  })
  return (
    <div ref={menuRef} tabIndex={0} onContextMenu={ctx.onContextMenu}>
      <div ref={svgRef} onClick={onClick} dangerouslySetInnerHTML={{ __html: props.svg }} />
      {ctx.nodeForm !== null && ctx.nodeForm.kind === 'member' && (
        <MantineProvider>
          <AddMemberInlineForm
            classes={props.projection.class.classes}
            initialClassName={ctx.nodeForm.className}
            afterElementId={ctx.nodeForm.anchorElementId}
            onDone={ctx.closeNodeForm}
          />
        </MantineProvider>
      )}
      {ctx.nodeForm !== null && ctx.nodeForm.kind === 'relation' && (
        <MantineProvider>
          <AddRelationInlineForm
            classes={props.projection.class.classes}
            initialFrom={ctx.nodeForm.className}
            afterElementId={ctx.nodeForm.anchorElementId}
            onDone={ctx.closeNodeForm}
          />
        </MantineProvider>
      )}
      <MantineProvider>
        <PropertyPanel projection={props.projection} parseError={null} />
      </MantineProvider>
    </div>
  )
}

// ---------- 表单辅助（与 use-canvas-context-menu.test.tsx 同款） ----------

function inputByLabel(host: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.trim() === labelText)
  if (label === undefined) throw new Error(`未找到标签：${labelText}`)
  const input = document.getElementById(label.htmlFor)
  if (!(input instanceof HTMLInputElement)) throw new Error(`标签未关联输入框：${labelText}`)
  return input
}

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function pressEnter(input: HTMLInputElement): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

async function clickButton(host: HTMLElement, text: string): Promise<void> {
  const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)
  if (button === undefined) throw new Error(`未找到按钮：${text}`)
  await act(async () => button.click())
}

async function optionTexts(host: HTMLElement, labelText: string): Promise<string[]> {
  const input = inputByLabel(host, labelText)
  await act(async () => {
    input.click()
  })
  return Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim() ?? '')
}

async function selectOption(host: HTMLElement, labelText: string, optionText: string): Promise<void> {
  const texts = await optionTexts(host, labelText)
  const index = texts.indexOf(optionText)
  if (index === -1) throw new Error(`未找到选项：${optionText}（现有：${texts.join(' | ')}）`)
  const options = Array.from(document.querySelectorAll('[role="option"]'))
  await act(async () => {
    ;(options[index] as HTMLElement).click()
  })
}

describe('验收场景 A（单测等价覆盖）', () => {
  let host: HTMLDivElement
  let root: Root
  let snapshots: MenuSnapshot[]
  let api: { current: Api | null }

  const SEED = 'classDiagram\n    class Account\n'

  beforeEach(() => {
    window.localStorage?.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  /** 按当前 store 源码重渲染（真实 app 每次编辑后重投影；逐步走通要用） */
  function rerender(): HTMLDivElement {
    const projection = projectionOf(useEditorStore.getState().source)
    act(() => {
      root.render(
        <Harness
          projection={projection}
          svg={svgOf(projection)}
          onState={(s) => snapshots.push(s)}
          apiRef={api}
        />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  function contextMenuOn(container: Element, selector: string): boolean {
    let prevented = false
    act(() => {
      const el = container.querySelector(selector)
      if (el === null) throw new Error(`未找到元素：${selector}`)
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      el.dispatchEvent(event)
      prevented = event.defaultPrevented
    })
    return prevented
  }

  /** 左键点击（走 useCanvasSelection 的 onClick 链路） */
  function clickOn(container: Element, selector: string): void {
    act(() => {
      const el = container.querySelector(selector)
      if (el === null) throw new Error(`未找到元素：${selector}`)
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }

  function spyCommitIntent() {
    return vi.spyOn(useEditorStore.getState(), 'commitIntent')
  }

  function intentAt(spy: ReturnType<typeof spyCommitIntent>, n: number): Record<string, unknown> | undefined {
    return spy.mock.calls[n]?.[0]
  }

  it('加类 → 两个成员 → 连到另一个类 → 点线改基数/标签并改成 *--', async () => {
    resetEditorHistory(SEED)
    let container = rerender()

    // ① 加类：右键画布空白 → 添加类（真实 hook），默认名「新类」
    act(() => api.current!.addClass())
    expect(useEditorStore.getState().source).toContain('class 新类')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class', name: '新类' })

    // ② 加两个成员：右键「新类」→ 添加成员 → 表单提交；每步后按 store 源码重投影
    for (const text of ['String owner', 'int balance']) {
      container = rerender()
      const spy = spyCommitIntent()
      contextMenuOn(container, '[data-id="新类"]')
      act(() => api.current!.addMember())
      await typeInto(inputByLabel(container, zhDict.app.propertyPanel.memberText), text)
      await clickButton(container, zhDict.app.propertyPanel.add)
      expect(intentAt(spy, 0)).toMatchObject({
        type: 'add-member',
        className: '新类',
        text,
        afterElementId: 'class:新类',
      })
      vi.restoreAllMocks()
    }
    const withMembers = useEditorStore.getState().source
    expect(withMembers).toContain('新类 : +String owner')
    expect(withMembers).toContain('新类 : +int balance')

    // ③ 连到另一个类（预置的 Account）：右键「新类」→ 添加关系，终点默认取另一个类
    container = rerender()
    const relationSpy = spyCommitIntent()
    contextMenuOn(container, '[data-id="新类"]')
    act(() => api.current!.addRelation())
    await clickButton(container, zhDict.app.propertyPanel.add)
    expect(intentAt(relationSpy, 0)).toMatchObject({
      type: 'add-relation',
      from: '新类',
      to: 'Account',
      afterElementId: 'class:新类',
    })
    vi.restoreAllMocks()
    expect(useEditorStore.getState().source).toContain('新类 --> Account')

    // ④ 点选这条线 → 选中该关系（工单 02 裁定：点线 / 点标签 / 点基数都归属到边）
    container = rerender()
    const selection = () => useEditorStore.getState().selection

    clickOn(container, 'path[data-id="relation:1"]')
    expect(selection()).toEqual({ kind: 'class-relation', elementId: 'relation:1' })
    // 右侧出现真实 RelationForm（「起点 → 终点」表头由关系投影渲染）
    expect(container.textContent).toContain('新类 → Account')

    // ⑤ 在右侧表单标基数与标签、把关系类型改成 *--
    await selectOption(container, zhDict.app.propertyPanel.relationKind, zhDict.app.classRelKinds['*--'])
    container = rerender()
    await typeInto(inputByLabel(container, zhDict.app.propertyPanel.cardFrom), '1')
    container = rerender()
    await typeInto(inputByLabel(container, zhDict.app.propertyPanel.cardTo), '*')
    container = rerender()
    await typeInto(inputByLabel(container, zhDict.app.propertyPanel.relationLabel), '拥有')
    await pressEnter(inputByLabel(container, zhDict.app.propertyPanel.relationLabel))

    const finalSource = useEditorStore.getState().source
    expect(finalSource).toContain('新类 "1" *-- "*" Account : 拥有')
    // 弱替代证据（代替真机渲染）：产物仍是合法 mermaid
    await expect(mermaid.parse(finalSource)).resolves.toBeTruthy()
  })

  it('点关系标签 / 点基数文本 → 同样选中该关系（工单 02 的「归属到边」裁定）', () => {
    const source = 'classDiagram\n    class Wallet\n    class Account\n    Wallet "1" --> "*" Account : owns\n'
    resetEditorHistory(source)
    const container = rerender()

    // 标签与基数在渲染后被标注上所属关系的位置序 data-id（点它们 = 选中该条关系）
    clickOn(container, 'g.edgeLabel')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class-relation', elementId: 'relation:1' })

    act(() => {
      useEditorStore.getState().select(null)
    })
    clickOn(container, 'g.edgeTerminals')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class-relation', elementId: 'relation:1' })

    // 标签 / 基数是从关系投影找回来的，右侧出现该关系的表单
    expect(container.textContent).toContain('Wallet → Account')
  })

  it('中位插入一条关系后，点原有连线仍选中同一条语义上的线（本批最易碎回归项）', () => {
    const source = `classDiagram
    class A
    class B
    class C
    A --> B
    B --> C
    A --> C
`
    resetEditorHistory(source)
    const before = projectionOf(source)
    // 位置序 = 源码顺序
    expect(before.class.relations.map((r) => r.elementId)).toEqual(['relation:1', 'relation:2', 'relation:3'])
    expect(before.class.relations.map((r) => `${r.from}->${r.to}`)).toEqual(['A->B', 'B->C', 'A->C'])

    // 在 `A --> B` 之后中位插入一条新关系：源码第 3 条（B --> C）位置序后移
    const ok = useEditorStore.getState().commitIntent({
      type: 'add-relation',
      from: 'A',
      to: 'B',
      kind: '-->',
      afterElementId: 'relation:1',
    })
    expect(ok).toBe(true)

    const after = projectionOf(useEditorStore.getState().source)
    expect(after.class.relations.map((r) => `${r.from}->${r.to}`)).toEqual(['A->B', 'A->B', 'B->C', 'A->C'])
    // 原 relation:2 的 B --> C 现在是 relation:3（与 mermaid 会重排的 data-id 形成对照）
    expect(after.class.relations[2]).toMatchObject({ from: 'B', to: 'C', elementId: 'relation:3' })

    const container = rerender()
    // 文档序第 3 条路径 = 源码第 3 条关系，点击它选中的仍是 B --> C
    clickOn(container, 'path[data-id="relation:3"]')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class-relation', elementId: 'relation:3' })
    expect(container.textContent).toContain('B → C')
  })

  it('右键关系边 → 「在属性面板中编辑」：菜单关闭、选中停在该关系、右侧出现它的表单（工单 05）', () => {
    const source = 'classDiagram\n    class Foo\n    class Bar\n    Foo "1" --> "*" Bar : owns\n'
    resetEditorHistory(source)
    const container = rerender()

    contextMenuOn(container, 'path[data-id="relation:1"]')
    expect(snapshots.at(-1)!.menuOpen).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class-relation', elementId: 'relation:1' })

    // 菜单项自身的语义 = 选中该连线 + 关闭菜单（D5）；字段编辑由右侧表单承接
    act(() => useEditorStore.getState().select(null))
    act(() => api.current!.editRelation())

    expect(snapshots.at(-1)!.menuOpen).toBe(false)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class-relation', elementId: 'relation:1' })
    // 属性面板得到的是这条关系：表头 + 基数 / 标签字段都在
    expect(container.textContent).toContain('Foo → Bar')
    expect(container.textContent).toContain(zhDict.app.propertyPanel.cardFrom)
    expect(container.textContent).toContain(zhDict.app.propertyPanel.relationLabel)
  })
})
