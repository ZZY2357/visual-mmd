import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { detectDiagramType } from '../diagram-registry'
import {
  SAMPLE_DIAGRAMS,
  sampleDiagramName,
  sampleNamesEn,
  sampleNamesZh,
} from '../sample-library'

/**
 * 首启动示例图表（self-grill-hardening 工单 17）：
 * - 示例数量与图种覆盖（含 flowchart、sequence）
 * - 至少一张含连线与中文标签（可练手）
 * - 每条示例源码通过真实 `mermaid.parse`（复用 05 的金样机制）
 * - 名字走 i18n（zh / en 双份）
 */

const CJK = /[\u4e00-\u9fff]/

describe('示例图表：构成与覆盖', () => {
  it('预置 3–5 张示例', () => {
    expect(SAMPLE_DIAGRAMS.length).toBeGreaterThanOrEqual(3)
    expect(SAMPLE_DIAGRAMS.length).toBeLessThanOrEqual(5)
  })

  it('覆盖不同图种，至少含 flowchart 与 sequence', () => {
    const types = SAMPLE_DIAGRAMS.map((s) => detectDiagramType(s.source)?.id ?? null)
    expect(types).toContain('flowchart')
    expect(types).toContain('sequence')
    // 覆盖多种图种：类型去重后数量 >= 3
    expect(new Set(types).size).toBeGreaterThanOrEqual(3)
    expect(types).not.toContain(null) // 每条示例都必须能被注册表识别
  })

  it('示例 id 互不相同且稳定（无时间戳）', () => {
    const ids = SAMPLE_DIAGRAMS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('至少一张示例含连线与中文标签，可供练手', () => {
    const practice = SAMPLE_DIAGRAMS.filter(
      (s) => s.source.includes('-->') && CJK.test(s.source),
    )
    expect(practice.length).toBeGreaterThanOrEqual(1)
  })
})

describe('示例图表：源码通过真实 mermaid.parse', () => {
  for (const sample of SAMPLE_DIAGRAMS) {
    it(`${sample.nameKey} 示例 parse 通过`, async () => {
      await expect(mermaid.parse(sample.source)).resolves.toBeTruthy()
    })
  }
})

describe('示例图表：名字 i18n（zh / en 双份）', () => {
  it('zh 与 en 名字表键一一对应', () => {
    expect(Object.keys(sampleNamesEn).sort()).toEqual(Object.keys(sampleNamesZh).sort())
  })

  it('每条示例都有双语名，且 en 名不含中文', () => {
    for (const sample of SAMPLE_DIAGRAMS) {
      expect(sampleNamesZh[sample.nameKey]).toBeTruthy()
      const en = sampleNamesEn[sample.nameKey]
      expect(en).toBeTruthy()
      expect(CJK.test(en)).toBe(false)
    }
  })

  it('sampleDiagramName 未初始化 i18next 时回落中文', () => {
    expect(sampleDiagramName('flowchart')).toBe(sampleNamesZh.flowchart)
  })
})
