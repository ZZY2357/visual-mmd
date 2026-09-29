import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { PropertyPanel } from '../PropertyPanel'
import { initI18n } from '../../i18n'
import { mindmapParser } from '../../lib/pipeline/mindmap'
import { buildMindmapProjection } from '../../lib/projection/mindmap-projection'
import { sequenceParser } from '../../lib/pipeline/sequence'
import { buildSequenceProjection } from '../../lib/projection/sequence-projection'
import { classParser } from '../../lib/pipeline/class'
import { buildClassProjection } from '../../lib/projection/class-projection'
import type { AnyProjection } from '../../lib/diagram-registry'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'

/**
 * 属性面板（工单 04）：mindmap 空图不再有「添加根节点」起步表单——
 * 根节点的唯一入口回到画布空白右键菜单（CONTEXT.md「元素添加的唯一入口」）。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const EMPTY_MINDMAP = 'mindmap\n'

function emptyMindmapProjection(): AnyProjection {
  const parsed = mindmapParser.parse(EMPTY_MINDMAP)
  if (!parsed.ok) throw new Error('样例源码必须可解析')
  return { type: 'mindmap', mindmap: buildMindmapProjection(parsed.doc) }
}

describe('PropertyPanel（工单 04 移除 mindmap 根节点表单）', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    window.localStorage?.clear()
    resetEditorHistory(EMPTY_MINDMAP)
    useEditorStore.getState().select(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MantineProvider>
          <PropertyPanel projection={emptyMindmapProjection()} parseError={null} />
        </MantineProvider>,
      )
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
  })

  it('空 mindmap 不再渲染根节点起步表单（无「添加根节点」按钮/提示）', () => {
    const text = host.textContent ?? ''
    expect(text).not.toContain('添加根节点')
    expect(text).not.toContain('思维导图为空')
    // 面板本身照常渲染（结构树 + 图表级提示）
    expect(text).toContain('属性')
  })
})

// ---------- rect / box / namespace 在结构树可见（工单 06） ----------

describe('结构树呈现 rect / box / namespace（工单 06）', () => {
  let host: HTMLDivElement
  let root: Root

  async function renderPanel(projection: AnyProjection) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MantineProvider>
          <PropertyPanel projection={projection} parseError={null} />
        </MantineProvider>,
      )
    })
    return host.textContent ?? ''
  }

  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('sequence：rect 色值与 box 标签出现在结构树', async () => {
    const source = `sequenceDiagram
    rect rgb(200, 150, 255)
    end
    box Purple 数据库组
        participant DB
    end
`
    const parsed = sequenceParser.parse(source)
    if (!parsed.ok) throw parsed.error
    const text = await renderPanel({ type: 'sequence', sequence: buildSequenceProjection(parsed.doc) })
    expect(text).toContain('rgb(200, 150, 255)')
    expect(text).toContain('数据库组')
  })

  it('class：namespace 名出现在结构树', async () => {
    const parsed = classParser.parse('classDiagram\nnamespace Shapes {\n    class Circle\n}\n')
    if (!parsed.ok) throw parsed.error
    const text = await renderPanel({ type: 'class', class: buildClassProjection(parsed.doc) })
    expect(text).toContain('Shapes')
  })
})
