import { describe, expect, it } from 'vitest'
import {
  classDefElementId,
  classElementId,
  linkElementId,
  mindmapNodeElementId,
  namespaceElementId,
  nodeElementId,
  participantElementId,
  parseClassDefElementId,
  parseClassElementId,
  parseMindmapNodeElementId,
  parseNamespaceElementId,
  parseNodeElementId,
  parseParticipantElementId,
  splitOccurrence,
  withOccurrence,
} from '../element-id'

/**
 * 元素 ID 的编解码（工单 01）：协议只写一份，生成端（四个 parser）与消费端
 * （projection / canvas-selection）都调它，不再各自拼字符串或正则反解。
 *
 * 最容易漂移的一条是「occurrence 为 1 时不带 `#n` 后缀」——它既是编码规则也是解码依据，
 * 两端只要有一端写错，寻址就静默失效（点了没反应），故这里逐条钉住。
 */

describe('withOccurrence / splitOccurrence：#n 后缀规则只写一次', () => {
  it('occurrence 为 1（及缺省）时**不带**后缀', () => {
    expect(withOccurrence('node:A', 1)).toBe('node:A')
    expect(withOccurrence('node:A')).toBe('node:A')
    expect(withOccurrence('node:A', 0)).toBe('node:A')
  })

  it('occurrence 大于 1 时带 `#n` 后缀', () => {
    expect(withOccurrence('node:A', 2)).toBe('node:A#2')
    expect(withOccurrence('node:A', 12)).toBe('node:A#12')
  })

  it('缺失后缀解回 1（与「为 1 时不带」互为逆运算）', () => {
    expect(splitOccurrence('node:A')).toEqual({ base: 'node:A', occurrence: 1 })
  })

  it('有后缀时按**最后一个** `#` 切分（base 自身可含 `#`）', () => {
    expect(splitOccurrence('node:A#2')).toEqual({ base: 'node:A', occurrence: 2 })
    expect(splitOccurrence('node:A#B#3')).toEqual({ base: 'node:A#B', occurrence: 3 })
  })

  it('不像 occurrence 的后缀（`x#0` / `x#01` / `x#`）原样留在 base 里', () => {
    expect(splitOccurrence('node:A#0')).toEqual({ base: 'node:A#0', occurrence: 1 })
    expect(splitOccurrence('node:A#01')).toEqual({ base: 'node:A#01', occurrence: 1 })
    expect(splitOccurrence('node:A#')).toEqual({ base: 'node:A#', occurrence: 1 })
  })

  it('往返一致：split ∘ with = 恒等（含 / 不含 `#` 两种形态）', () => {
    const bases = ['node:A', 'participant:B', 'link:A#B:C', 'class:Foo', 'mindmap-node:1']
    for (const base of bases) {
      for (const occurrence of [1, 2, 3, 10]) {
        expect(splitOccurrence(withOccurrence(base, occurrence))).toEqual({ base, occurrence })
      }
    }
  })
})

describe('节点类 ID：编码与解码成对', () => {
  it('node：往返一致，非 node 前缀返回 null', () => {
    expect(nodeElementId('A')).toBe('node:A')
    expect(nodeElementId('A', 2)).toBe('node:A#2')
    expect(parseNodeElementId('node:A')).toEqual({ nodeId: 'A', occurrence: 1 })
    expect(parseNodeElementId('node:A#2')).toEqual({ nodeId: 'A', occurrence: 2 })
    expect(parseNodeElementId('participant:A')).toBeNull()
    expect(parseNodeElementId('node:')).toBeNull()
    expect(parseNodeElementId('A')).toBeNull()
  })

  it('participant：往返一致，非 participant 前缀返回 null', () => {
    expect(participantElementId('B')).toBe('participant:B')
    expect(participantElementId('B', 3)).toBe('participant:B#3')
    expect(parseParticipantElementId('participant:B')).toEqual({ actorId: 'B', occurrence: 1 })
    expect(parseParticipantElementId('participant:B#3')).toEqual({ actorId: 'B', occurrence: 3 })
    expect(parseParticipantElementId('participant:B#')).toEqual({ actorId: 'B#', occurrence: 1 })
    expect(parseParticipantElementId('node:B')).toBeNull()
  })

  it('class / namespace / classdef：与 parser 的重名计数同规则（count 为 1 不带后缀）', () => {
    expect(classElementId('Foo')).toBe('class:Foo')
    expect(classElementId('Foo', 2)).toBe('class:Foo#2')
    expect(parseClassElementId('class:Foo#2')).toEqual({ name: 'Foo', occurrence: 2 })

    expect(namespaceElementId('Shapes')).toBe('namespace:Shapes')
    expect(namespaceElementId('Shapes', 2)).toBe('namespace:Shapes#2')
    expect(parseNamespaceElementId('namespace:Shapes')).toEqual({ name: 'Shapes', occurrence: 1 })

    expect(classDefElementId('emphasis')).toBe('classdef:emphasis')
    expect(classDefElementId('emphasis', 4)).toBe('classdef:emphasis#4')
    expect(parseClassDefElementId('classdef:emphasis#4')).toEqual({ name: 'emphasis', occurrence: 4 })
    // flowchart 的 class 语句 id 是 `class#N`（计数器，不是类名），不落在这套协议里
    expect(parseClassElementId('class#3')).toBeNull()
  })

  it('link：两端节点 id + occurrence', () => {
    expect(linkElementId('A', 'B')).toBe('link:A:B')
    expect(linkElementId('A', 'B', 2)).toBe('link:A:B#2')
    // 消费端（flowchart 投影）用 splitOccurrence 取 occurrence，不再手写正则
    expect(splitOccurrence(linkElementId('A', 'B', 2))).toEqual({ base: 'link:A:B', occurrence: 2 })
  })
})

describe('mindmap 节点 ID：位置序（1 基）成对', () => {
  it('编码 `mindmap-node:N`，解码回 N', () => {
    expect(mindmapNodeElementId(1)).toBe('mindmap-node:1')
    expect(mindmapNodeElementId(12)).toBe('mindmap-node:12')
    expect(parseMindmapNodeElementId('mindmap-node:1')).toBe(1)
    expect(parseMindmapNodeElementId('mindmap-node:12')).toBe(12)
  })

  it('非法形态返回 null（0 / 负数 / 别的图种 / 带 occurrence 后缀）', () => {
    expect(parseMindmapNodeElementId('mindmap-node:0')).toBeNull()
    expect(parseMindmapNodeElementId('mindmap-node:')).toBeNull()
    expect(parseMindmapNodeElementId('mindmap-node:1#2')).toBeNull()
    expect(parseMindmapNodeElementId('node:1')).toBeNull()
    expect(parseMindmapNodeElementId('mindmap-node-1')).toBeNull()
  })

  it('与 canvas-selection 的 DOM id 换算同源：第 N 个节点 ↔ `node_{N-1}`', () => {
    // mindmap-adapter 用 parseMindmapNodeElementId 反解，序号基数与生成端必须一致
    for (const n of [1, 2, 12]) {
      expect(parseMindmapNodeElementId(mindmapNodeElementId(n))).toBe(n)
    }
  })
})
