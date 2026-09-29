import { describe, expect, it } from 'vitest'
import { edgeElementIdOf, edgeOrdinalOf, isEdgeElementId } from '../edge-identity'

/**
 * 连线位置序身份（ADR-0012，工单 02）：0 基「位置序」↔ 投影 elementId（1 基）互转。
 * 身份形态与 pipeline 的 elementId 同源，不另造编号。
 */

describe('位置序身份识别（工单 02）', () => {
  it('四种位置序身份都识别（relation / message / note / block）', () => {
    expect(isEdgeElementId('relation:1')).toBe(true)
    expect(isEdgeElementId('message:12')).toBe(true)
    expect(isEdgeElementId('note:1')).toBe(true)
    expect(isEdgeElementId('block:3')).toBe(true)
  })

  it('非位置序身份一律不识别（节点 id / mermaid data-id / 空 / 0 基 / 负数）', () => {
    expect(isEdgeElementId('Account')).toBe(false)
    expect(isEdgeElementId('id_Customer_Account_1')).toBe(false)
    expect(isEdgeElementId('L_A_B_0')).toBe(false)
    expect(isEdgeElementId('edgeNote0')).toBe(false)
    expect(isEdgeElementId('i1')).toBe(false)
    expect(isEdgeElementId('')).toBe(false)
    expect(isEdgeElementId('relation:0')).toBe(false)
    expect(isEdgeElementId('relation:-1')).toBe(false)
    expect(isEdgeElementId('participant:relation:1')).toBe(false)
    expect(isEdgeElementId('relation:1#2')).toBe(false)
    expect(isEdgeElementId('relation: 1')).toBe(false)
  })
})

describe('0 基位置序 ↔ elementId 互转（工单 02）', () => {
  it('第 0 条 → `:1`（pipeline 的计数器 1 基）', () => {
    expect(edgeElementIdOf('relation', 0)).toBe('relation:1')
    expect(edgeElementIdOf('message', 0)).toBe('message:1')
    expect(edgeElementIdOf('note', 0)).toBe('note:1')
    expect(edgeElementIdOf('block', 0)).toBe('block:1')
  })

  it('往返一致：parse ∘ format = 恒等', () => {
    for (const kind of ['relation', 'message', 'note', 'block'] as const) {
      for (const ordinal of [0, 1, 2, 9, 41]) {
        const elementId = edgeElementIdOf(kind, ordinal)
        expect(elementId).not.toBeNull()
        expect(edgeOrdinalOf(elementId as string)).toEqual({ kind, ordinal })
      }
    }
  })

  it('elementId → 0 基序号（`message:3` = 第 2 条消息）', () => {
    expect(edgeOrdinalOf('message:3')).toEqual({ kind: 'message', ordinal: 2 })
    expect(edgeOrdinalOf('relation:1')).toEqual({ kind: 'relation', ordinal: 0 })
  })

  it('非位置序身份或非法序号 → null（不抛错）', () => {
    expect(edgeOrdinalOf('Account')).toBeNull()
    expect(edgeOrdinalOf('id_A_B_1')).toBeNull()
    expect(edgeOrdinalOf('relation:0')).toBeNull()
    expect(edgeOrdinalOf('relation:')).toBeNull()
    expect(edgeElementIdOf('relation', -1)).toBeNull()
    expect(edgeElementIdOf('relation', 1.5)).toBeNull()
  })

  it('位置序对「中位插入重排」稳定：条数不变时身份只与源码顺序有关', () => {
    // 源码里第 3 条关系插入后，原先的第 1、2 条身份不变，新关系取第 3 个位置序
    const before = [0, 1].map((i) => edgeElementIdOf('relation', i))
    const afterInsertAtEnd = [0, 1, 2].map((i) => edgeElementIdOf('relation', i))
    expect(afterInsertAtEnd.slice(0, 2)).toEqual(before)
    // 位置序身份与 mermaid 的全局自增计数器无关：形态里不含 from/to/counter
    expect(edgeElementIdOf('relation', 2)).toBe('relation:3')
  })
})
