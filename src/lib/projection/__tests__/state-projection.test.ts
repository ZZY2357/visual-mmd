import { describe, expect, it } from 'vitest'
import { STATE_TEMPLATE, type AnyProjection } from '../../diagram-registry'
import { stateParser } from '../../pipeline/state'
import { buildStateProjection, resolveStateSelection, type ProjectionState } from '../state-projection'
import { stateDataIdResolver, stateCanvasCapabilities } from '../../canvas-selection/state-adapter'
import { annotateStateTransitionIdentities } from '../../canvas-selection/edge-locate'

/**
 * state 投影 / 适配器测试（more-diagrams 工单 02）：状态归并、隐式状态、
 * 复合父子、位置序转移身份（ADR-0012）、选中回落与删除意图映射。
 */

function parseOk(source: string) {
  const result = stateParser.parse(source)
  if (!result.ok) throw new Error(`解析失败（${result.error.line}）：${result.error.message}`)
  return result.doc
}

function projectionOf(source: string) {
  return buildStateProjection(parseOk(source))
}

describe('state 投影（工单 02）', () => {
  it('起步模板：状态、转移、note、direction 全部可见', () => {
    const p = projectionOf(STATE_TEMPLATE)
    expect(p.states.map((s) => s.id)).toEqual(['idle', 'running', 'archiving', 'logging', 'reporting'])
    expect(p.direction).toBeNull()
    const archiving = p.states.find((s) => s.id === 'archiving') as ProjectionState
    expect(archiving.composite).toBe(true)
    expect(archiving.elementId).toBe('state:archiving')
    // 复合内部成员的 parentId 指向复合状态
    expect(p.states.find((s) => s.id === 'logging')?.parentId).toBe('archiving')
    expect(p.transitions).toHaveLength(4)
    expect(p.transitions.map((t) => t.elementId)).toEqual(['transition:1', 'transition:2', 'transition:3', 'transition:4'])
    expect(p.notes).toEqual([{ elementId: 'note:1', side: 'right', target: 'idle', text: '双击状态可编辑描述' }])
    // idle 的描述来自 `id : desc` 行
    const idle = p.states.find((s) => s.id === 'idle') as ProjectionState
    expect(idle).toMatchObject({ desc: '等待用户输入', descForm: 'line', parentId: null })
  })

  it('仅被转移引用的状态是隐式状态（elementId null）', () => {
    const p = projectionOf('stateDiagram-v2\n    a --> b\n')
    expect(p.states.map((s) => [s.id, s.elementId, s.tailElementId])).toEqual([
      ['a', null, null],
      ['b', null, null],
    ])
  })

  it('[*] 不是状态：只出现在转移端点', () => {
    const p = projectionOf('stateDiagram-v2\n    [*] --> s1\n    s1 --> [*]\n')
    expect(p.states.map((s) => s.id)).toEqual(['s1'])
    expect(p.transitions.map((t) => [t.from, t.to])).toEqual([['[*]', 's1'], ['s1', '[*]']])
  })

  it('choice/fork/join 伪状态标注进投影', () => {
    const p = projectionOf('stateDiagram-v2\n    state c <<choice>>\n')
    expect(p.states[0]).toMatchObject({ id: 'c', pseudo: 'choice', composite: false })
  })

  it('direction 取首个 direction 行；缺省 null', () => {
    expect(projectionOf('stateDiagram-v2\ndirection LR\ns1 --> s2\n').direction).toBe('LR')
    expect(projectionOf('stateDiagram-v2\ns1 --> s2\n').direction).toBeNull()
  })
})

describe('state 选中回落 / 删除意图 / 键盘（能力包口径）', () => {
  const p = projectionOf(STATE_TEMPLATE)
  const wrapper: Extract<AnyProjection, { type: 'state' }> = { type: 'state', state: p }
  const caps = stateCanvasCapabilities

  it('resolveStateSelection：存在的选中保留，已消失的回落 null', () => {
    expect(resolveStateSelection(p, { kind: 'state', id: 'idle' })).toMatchObject({ kind: 'state' })
    expect(resolveStateSelection(p, { kind: 'state', id: 'ghost' })).toBeNull()
    expect(resolveStateSelection(p, { kind: 'state-transition', elementId: 'transition:1' })).not.toBeNull()
    expect(resolveStateSelection(p, { kind: 'state-transition', elementId: 'transition:9' })).toBeNull()
    expect(resolveStateSelection(p, { kind: 'state-note', elementId: 'note:1' })).not.toBeNull()
    expect(resolveStateSelection(p, { kind: 'diagram' })).toMatchObject({ kind: 'diagram' })
  })

  it('dataIdResolver：状态 id 命中节点，转移 elementId 命中位置序边', () => {
    const resolver = stateDataIdResolver(p)
    expect(resolver('idle')).toEqual({ kind: 'node', id: 'idle' })
    expect(resolver('transition:2')).toEqual({ kind: 'element', elementId: 'transition:2' })
    expect(resolver('id_idle_1')).toBeNull()
  })

  it('canvasIdOf / toSelection 互逆；note 不寻址', () => {
    expect(caps.canvasIdOf(wrapper, { kind: 'state', id: 'idle' })).toBe('idle')
    expect(caps.canvasIdOf(wrapper, { kind: 'state-transition', elementId: 'transition:1' })).toBe('transition:1')
    expect(caps.canvasIdOf(wrapper, { kind: 'state-note', elementId: 'note:1' })).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'idle' })).toEqual({ kind: 'state', id: 'idle' })
    expect(caps.toSelection({ kind: 'element', elementId: 'transition:1' })).toEqual({
      kind: 'state-transition',
      elementId: 'transition:1',
    })
  })

  it('deleteIntent：状态 / 转移 / note 各归各；别种选中 null', () => {
    expect(caps.deleteIntent(wrapper, { kind: 'state', id: 'idle' })).toEqual({ type: 'delete-state', id: 'idle' })
    expect(caps.deleteIntent(wrapper, { kind: 'state-transition', elementId: 'transition:1' })).toEqual({
      type: 'delete-transition',
      elementId: 'transition:1',
    })
    expect(caps.deleteIntent(wrapper, { kind: 'state-note', elementId: 'note:1' })).toEqual({
      type: 'delete-note',
      elementId: 'note:1',
    })
    expect(caps.deleteIntent(wrapper, { kind: 'diagram' })).toBeNull()
    expect(caps.deleteIntent(wrapper, null)).toBeNull()
  })

  it('keyPlan：Tab 加同级状态（复合内状态落回同一复合），Enter 开转移表单，Delete 删除', () => {
    const tab = caps.keyHandler(wrapper)({ key: 'Tab', selection: { kind: 'state', id: 'logging' } })
    expect(tab).not.toBeNull()
    expect(tab?.intents[0]).toMatchObject({ type: 'add-state', parentElementId: 'state:archiving' })
    expect(tab?.newElementTarget?.selection).toEqual({ kind: 'state', id: 's' })

    const enter = caps.keyHandler(wrapper)({ key: 'Enter', selection: { kind: 'state', id: 'idle' } })
    expect(enter).toMatchObject({ intents: [], form: 'transition' })

    const del = caps.keyHandler(wrapper)({ key: 'Delete', selection: { kind: 'state', id: 'ghost' } })
    expect(del).toBeNull()
    expect(caps.keyHandler(wrapper)({ key: 'Delete', selection: { kind: 'state', id: 'idle' } })).toEqual({
      intents: [{ type: 'delete-state', id: 'idle' }],
      clearSelection: true,
    })
  })

  it('edgeAnnotator：条数相符时标注 transition:N 身份，不符时整体放弃（ADR-0012）', () => {
    // 与 class 实测产物同构：mermaid 给每条 path 带自己的 data-id（相邻不同值），
    // groupRepeats 按值去重分组后逐条反注
    const makePath = (id: string) => ({
      attrs: { 'data-id': id } as Record<string, string>,
      setAttribute(k: string, v: string) { this.attrs[k] = v },
      getAttribute(k: string) { return this.attrs[k] ?? null },
    })
    const paths = [makePath('L_idle_running_0'), makePath('L_running_archiving_1')]
    const root = {
      querySelectorAll(sel: string) {
        return sel.startsWith('.edgePaths') ? paths : []
      },
    }
    // 条数相符：第 k 个 path = transition:(k+1)
    annotateStateTransitionIdentities(root as unknown as ParentNode, 2)
    expect(paths.map((p) => p.attrs['data-id'])).toEqual(['transition:1', 'transition:2'])
    // 条数不符：整体放弃（绝不误归属）
    annotateStateTransitionIdentities(root as unknown as ParentNode, 3)
    expect(paths.map((p) => p.attrs['data-id'])).toEqual(['transition:1', 'transition:2'])
  })
})
