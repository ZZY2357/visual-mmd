import { describe, expect, it } from 'vitest'
import { flowchartParser } from '../flowchart'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'

function proj(source: string) {
  const res = flowchartParser.parse(source)
  if (!res.ok) return { error: res.error }
  return buildFlowchartProjection(res.doc as never)
}

describe('pipe label with space between arrow and pipe', () => {
  it('A -->|talk| B (no space) parses', () => {
    const p = proj('flowchart TB\nA -->|talk| B') as ReturnType<typeof buildFlowchartProjection>
    expect(p.nodes).toHaveLength(2)
    expect(p.edges).toHaveLength(1)
    expect(p.edges[0].label).toBe('talk')
  })

  it('A --> |talk| B (space before pipe)', () => {
    const p = proj('flowchart TB\nA --> |talk| B') as ReturnType<typeof buildFlowchartProjection>
    expect(p.nodes).toHaveLength(2)
    expect(p.edges).toHaveLength(1)
    expect(p.edges[0].label).toBe('talk')
  })

  it('A[me] --> | talk | B[him]', () => {
    const p = proj('flowchart TB\n    A[me] --> | talk | B[him]') as ReturnType<typeof buildFlowchartProjection>
    expect(p.nodes).toHaveLength(2)
    expect(p.edges).toHaveLength(1)
  })
})
