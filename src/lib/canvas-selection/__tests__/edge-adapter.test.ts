import { describe, expect, it } from 'vitest'
import { edgeSelectionOf } from '../edge-adapter'

/**
 * 连线适配器（工单 02）：位置序身份 → 编辑器 Selection。
 * 选中的右侧表单由 PropertyPanel 按 kind 分发（class-relation → RelationForm，
 * message → MessageForm），这里只保证 kind 与 elementId 对得上。
 */

describe('edgeSelectionOf（位置序身份 → 编辑器选中）', () => {
  it('class：关系边 → class-relation（elementId 原样透传）', () => {
    expect(edgeSelectionOf('class', 'relation:1')).toEqual({ kind: 'class-relation', elementId: 'relation:1' })
    expect(edgeSelectionOf('class', 'relation:7')).toEqual({ kind: 'class-relation', elementId: 'relation:7' })
  })

  it('sequence：消息 / 注释 / 块 → message / note / block', () => {
    expect(edgeSelectionOf('sequence', 'message:2')).toEqual({ kind: 'message', elementId: 'message:2' })
    expect(edgeSelectionOf('sequence', 'note:1')).toEqual({ kind: 'note', elementId: 'note:1' })
    expect(edgeSelectionOf('sequence', 'block:3')).toEqual({ kind: 'block', elementId: 'block:3' })
  })

  it('按图种收窄：class 不认消息/注释/块，sequence 不认关系', () => {
    expect(edgeSelectionOf('class', 'message:1')).toBeNull()
    expect(edgeSelectionOf('class', 'note:1')).toBeNull()
    expect(edgeSelectionOf('class', 'block:1')).toBeNull()
    expect(edgeSelectionOf('sequence', 'relation:1')).toBeNull()
  })

  it('非位置序身份一律 null（mermaid data-id / 节点 id / 空）', () => {
    expect(edgeSelectionOf('class', 'id_Customer_Account_1')).toBeNull()
    expect(edgeSelectionOf('sequence', 'i1')).toBeNull()
    expect(edgeSelectionOf('flowchart', 'L_A_B_0')).toBeNull()
    expect(edgeSelectionOf('mindmap', 'mindmap-node:1')).toBeNull()
    expect(edgeSelectionOf('class', 'Account')).toBeNull()
    expect(edgeSelectionOf('class', '')).toBeNull()
  })
})
