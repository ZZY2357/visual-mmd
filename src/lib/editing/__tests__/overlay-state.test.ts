import { describe, expect, it } from 'vitest'
import {
  IDLE_OVERLAY,
  canvasClickRuling,
  overlayTransition,
  pointerDownBlocksDrag,
  type OverlayOpen,
  type OverlayState,
} from '../overlay-state'

/**
 * 覆盖层状态机的转换表直测（architecture-deepening-2 工单 05）。
 * 纯函数、脱离 DOM——历史上三张 bug 工单的场景在这里各有一条固定用例：
 * - 内联编辑不被失焦抢焦点（工单 02）：inlineEdit 只经 begin/end 翻转，
 *   画布点击 / Escape 都不动它，拖拽让位裁定覆盖它；
 * - 指针捕获不劫持菜单（工单 08）：三个浮层打开时禁止背景拖拽；
 * - 点击空白全关：escape 一律清空四个互斥浮层。
 */

const MENU = { target: { kind: 'blank', diagramType: 'flowchart' } as const, x: 10, y: 20 }

function withOpen(state: OverlayState, open: OverlayState['open']): OverlayState {
  return { ...state, open }
}

describe('overlayTransition · openX（互斥浮层：每条打开路径收起其它浮层）', () => {
  it('open-menu 收起样式表单 / 节点表单 / 连线模式', () => {
    for (const prev of [
      { kind: 'styleForm', x: 1, y: 2 },
      { kind: 'nodeForm', form: { kind: 'note' as const, x: 0, y: 0 } },
      { kind: 'linkMode', link: { stage: 'pick-start' } as const },
    ] as OverlayOpen[]) {
      const t = overlayTransition(withOpen(IDLE_OVERLAY, prev), { type: 'open-menu', menu: MENU })
      expect(t.state.open).toEqual({ kind: 'menu', ...MENU })
      expect(t.completedLink).toBeNull()
    }
  })

  it('open-style-form / open-node-form 同样整体替换浮层（带负载）', () => {
    const fromMenu = withOpen(IDLE_OVERLAY, { kind: 'menu', ...MENU })
    expect(overlayTransition(fromMenu, { type: 'open-style-form', x: 3, y: 4 }).state.open).toEqual({
      kind: 'styleForm',
      x: 3,
      y: 4,
    })
    const form = { kind: 'member' as const, className: 'Foo', anchorElementId: 'class:Foo', x: 5, y: 6 }
    expect(overlayTransition(fromMenu, { type: 'open-node-form', form }).state.open).toEqual({
      kind: 'nodeForm',
      form,
    })
  })

  it('enter-link-mode 收起菜单（委托 link-mode：enter → pick-start，预选起点 → pick-end）', () => {
    const fromMenu = withOpen(IDLE_OVERLAY, { kind: 'menu', ...MENU })
    expect(overlayTransition(fromMenu, { type: 'enter-link-mode' }).state.open).toEqual({
      kind: 'linkMode',
      link: { stage: 'pick-start' },
    })
    expect(overlayTransition(fromMenu, { type: 'enter-link-mode', preselectedFrom: 'A' }).state.open).toEqual({
      kind: 'linkMode',
      link: { stage: 'pick-end', from: 'A' },
    })
  })
})

describe('overlayTransition · link-click-*（连线分支委托 link-mode 状态机）', () => {
  const linkStart: OverlayState['open'] = { kind: 'linkMode', link: { stage: 'pick-start' } }

  it('click-node 推进：pick-start → pick-end（无完成端点）', () => {
    const t = overlayTransition(withOpen(IDLE_OVERLAY, linkStart), { type: 'link-click-node', nodeId: 'A' })
    expect(t.state.open).toEqual({ kind: 'linkMode', link: { stage: 'pick-end', from: 'A' } })
    expect(t.completedLink).toBeNull()
  })

  it('click-node 完成：pick-end → idle，产出端点（落码交使用方）', () => {
    const t = overlayTransition(
      withOpen(IDLE_OVERLAY, { kind: 'linkMode', link: { stage: 'pick-end', from: 'A' } }),
      { type: 'link-click-node', nodeId: 'C' },
    )
    expect(t.state.open).toEqual({ kind: 'idle' })
    expect(t.completedLink).toEqual({ from: 'A', to: 'C' })
  })

  it('click-blank 取消回 idle（点击空白不落码）', () => {
    const t = overlayTransition(withOpen(IDLE_OVERLAY, linkStart), { type: 'link-click-blank' })
    expect(t.state.open).toEqual({ kind: 'idle' })
    expect(t.completedLink).toBeNull()
  })

  it('非连线模式下 link-click-* 是空迁移', () => {
    const t = overlayTransition(IDLE_OVERLAY, { type: 'link-click-node', nodeId: 'A' })
    expect(t.state).toEqual(IDLE_OVERLAY)
    expect(t.completedLink).toBeNull()
  })
})

describe('overlayTransition · escape（点击空白全关：唯一一份「全关」定义）', () => {
  it('四个互斥浮层一律回 idle', () => {
    for (const open of [
      { kind: 'menu', ...MENU },
      { kind: 'styleForm', x: 1, y: 2 },
      { kind: 'nodeForm', form: { kind: 'block' as const, x: 0, y: 0 } },
      { kind: 'linkMode', link: { stage: 'pick-end', from: 'A' } as const },
    ] as OverlayOpen[]) {
      const t = overlayTransition(withOpen(IDLE_OVERLAY, open), { type: 'escape' })
      expect(t.state.open).toEqual({ kind: 'idle' })
    }
  })

  it('escape 不动内联编辑（它的 Esc 是输入框自己的取消路径）', () => {
    const t = overlayTransition({ ...IDLE_OVERLAY, inlineEdit: true }, { type: 'escape' })
    expect(t.state).toEqual({ open: { kind: 'idle' }, inlineEdit: true })
  })
})

describe('overlayTransition · 内联编辑位（工单 02 历史 bug：失焦 / 画布点击不抢编辑）', () => {
  it('只有 begin / end 两个动作翻转 inlineEdit', () => {
    expect(overlayTransition(IDLE_OVERLAY, { type: 'begin-inline-edit' }).state).toEqual({
      open: { kind: 'idle' },
      inlineEdit: true,
    })
    const editing = { ...IDLE_OVERLAY, inlineEdit: true }
    expect(overlayTransition(editing, { type: 'end-inline-edit' }).state).toEqual({
      open: { kind: 'idle' },
      inlineEdit: false,
    })
  })

  it('close-float / open-menu / escape 都不翻转 inlineEdit（编辑与浮层并存，核实的产品事实）', () => {
    const editing = { ...IDLE_OVERLAY, inlineEdit: true }
    expect(overlayTransition(editing, { type: 'close-float' }).state.inlineEdit).toBe(true)
    expect(overlayTransition(editing, { type: 'open-menu', menu: MENU }).state.inlineEdit).toBe(true)
    expect(overlayTransition(editing, { type: 'escape' }).state.inlineEdit).toBe(true)
  })
})

describe('canvasClickRuling · 谁消费画布单击（裁定表）', () => {
  it('菜单 / 节点表单打开 → close-float（关浮层、不进选中链路）', () => {
    expect(canvasClickRuling(withOpen(IDLE_OVERLAY, { kind: 'menu', ...MENU }))).toBe('close-float')
    expect(
      canvasClickRuling(withOpen(IDLE_OVERLAY, { kind: 'nodeForm', form: { kind: 'note', x: 0, y: 0 } })),
    ).toBe('close-float')
  })

  it('连线模式 → link-mode（节点推进 / 空白取消）', () => {
    expect(canvasClickRuling(withOpen(IDLE_OVERLAY, linkModeOpen()))).toBe('link-mode')
  })

  it('样式表单与无浮层 → select（样式表单不被画布点击关闭，现状逐字保持）', () => {
    expect(canvasClickRuling(withOpen(IDLE_OVERLAY, { kind: 'styleForm', x: 1, y: 2 }))).toBe('select')
    expect(canvasClickRuling(IDLE_OVERLAY)).toBe('select')
  })

  it('内联编辑不改变点击裁定（点击画布落到选中，编辑经失焦提交）', () => {
    expect(canvasClickRuling({ ...IDLE_OVERLAY, inlineEdit: true })).toBe('select')
  })

  function linkModeOpen(): OverlayState['open'] {
    return { kind: 'linkMode', link: { stage: 'pick-start' } }
  }
})

describe('pointerDownBlocksDrag · 背景拖拽让位（工单 08 历史 bug：指针捕获不劫持菜单）', () => {
  it('内联编辑在场 → 阻止（输入框上的按下留给文本选择）', () => {
    expect(pointerDownBlocksDrag({ ...IDLE_OVERLAY, inlineEdit: true })).toBe(true)
  })

  it('menu / styleForm / nodeForm 打开 → 阻止（setPointerCapture 会把派生 click 劫持到容器）', () => {
    expect(pointerDownBlocksDrag(withOpen(IDLE_OVERLAY, { kind: 'menu', ...MENU }))).toBe(true)
    expect(pointerDownBlocksDrag(withOpen(IDLE_OVERLAY, { kind: 'styleForm', x: 1, y: 2 }))).toBe(true)
    expect(
      pointerDownBlocksDrag(withOpen(IDLE_OVERLAY, { kind: 'nodeForm', form: { kind: 'note', x: 0, y: 0 } })),
    ).toBe(true)
  })

  it('连线模式与无浮层 → 不阻止（现状如此）', () => {
    expect(pointerDownBlocksDrag(withOpen(IDLE_OVERLAY, { kind: 'linkMode', link: { stage: 'pick-start' } }))).toBe(
      false,
    )
    expect(pointerDownBlocksDrag(IDLE_OVERLAY)).toBe(false)
  })
})
