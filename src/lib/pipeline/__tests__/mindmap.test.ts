import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { mindmapParser, type MindmapShapeType } from '../mindmap'
import { reassemble } from '../document'

/**
 * mindmap 解析器与编辑意图（工单 08）。
 * 三类用例接缝与 flowchart/sequence/class 一致：verbatim identity / 手术式改写。
 */

const FULL_COVERAGE = `mindmap
  root((思维导图))
    起源
      长历史
        ::icon(fa fa-book)
      推广
        英国心理学家 Tony Buzan
    研究方向
      有效性研究
      自动创建
        用途
          创意技法
    工具
      纸和笔
      [方形]
      (圆角)
      ((圆))
      ))爆炸((
      )云(
      {{六边形}}
      %% 一条注释，必须逐字保留

      带缩进异常的节点
`

describe('verbatim identity（mindmap）', () => {
  it('覆盖全部形状 / 图标 / 缩进层级 / 注释 / 空行的用例逐字还原', () => {
    const parsed = mindmapParser.parse(FULL_COVERAGE)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(reassemble(parsed.doc)).toBe(FULL_COVERAGE)
  })

  it('无尾随换行的源码逐字还原', () => {
    const src = 'mindmap\n  根\n    子'
    const parsed = mindmapParser.parse(src)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(reassemble(parsed.doc)).toBe(src)
  })

  it('缺 mindmap 声明报解析错误', () => {
    const parsed = mindmapParser.parse('  根\n    子')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error.message).toContain('mindmap')
  })

  it('全部形状都被正确识别', () => {
    const parsed = mindmapParser.parse(FULL_COVERAGE)
    if (!parsed.ok) throw new Error('解析失败')
    const shapes = parsed.doc.elements
      .filter((p) => p.element.kind === 'mindmap-node')
      .map((p) => (p.element as unknown as { text: string; shapeType: MindmapShapeType | null }).shapeType)
    // root 圆 + 11 个默认节点 + [方形] (圆角) ((圆)) ))爆炸(( )云( {{六边形}} + 默认
    expect(shapes).toEqual([
      'circle',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'square',
      'rounded',
      'circle',
      'bang',
      'cloud',
      'hexagon',
      null,
    ])
  })
})

describe('手术式改写（mindmap）', () => {
  it('set-node-text：带形状节点只改括号内文本，其余逐字不变', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'set-node-text',
      elementId: 'mindmap-node:1',
      text: '全景图',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('root((全景图))')
    expect(result.source).toContain('      [方形]')
    expect(result.source).toContain('%% 一条注释，必须逐字保留')
    expect(result.source.split('\n').length).toBe(FULL_COVERAGE.split('\n').length)
  })

  it('set-node-text：无形状（默认）节点直接改文本', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'set-node-text',
      elementId: 'mindmap-node:2',
      text: '渊源',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    渊源')
    expect(result.source).not.toContain('    起源')
  })

  it('set-node-text：空文本拒绝应用', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'set-node-text',
      elementId: 'mindmap-node:2',
      text: '   ',
    })
    expect(result.ok).toBe(false)
  })

  it('set-node-shape：默认节点换成云形，只改该行', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'set-node-shape',
      elementId: 'mindmap-node:2',
      shape: 'cloud',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    )起源(')
    expect(result.source).toContain('      长历史')
  })

  it('set-node-shape：换回默认（无形状）', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'set-node-shape',
      elementId: 'mindmap-node:13',
      shape: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('      方形\n')
    expect(result.source).not.toContain('[方形]')
  })

  it('set-node-icon：为无图标节点追加 ::icon() 行，缩进跟随节点', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'set-node-icon',
      elementId: 'mindmap-node:2',
      icon: 'fa fa-book',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    起源\n    ::icon(fa fa-book)\n')
    // 其余内容不动
    expect(result.source).toContain('      长历史\n        ::icon(fa fa-book)')
  })

  it('set-node-icon：修改已有图标', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'set-node-icon',
      elementId: 'mindmap-node:3',
      icon: 'md md-book',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('::icon(md md-book)')
    expect(result.source).not.toContain('fa fa-book')
  })

  it('set-node-icon：置空删除图标行（整行消失，不留空行）', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'set-node-icon',
      elementId: 'mindmap-node:3',
      icon: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('::icon')
    expect(result.source).toContain('      长历史\n      推广')
  })

  it('add-child：新节点落在父节点子树之后，缩进取兄弟节点习惯', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'add-child',
      parentElementId: 'mindmap-node:3',
      text: '现代演变',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // node:3 长历史的第一个孩子 node:4 有 icon 行；子树最后一行是 icon
    expect(result.source).toContain('        ::icon(fa fa-book)\n        现代演变\n      推广')
  })

  it('add-child：目标不存在时拒绝', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'add-child',
      parentElementId: 'mindmap-node:999',
      text: 'X',
    })
    expect(result.ok).toBe(false)
  })

  it('add-sibling：新节点落在节点整棵子树之后，缩进与节点相同', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'add-sibling',
      elementId: 'mindmap-node:3',
      text: '同时代起源',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('        ::icon(fa fa-book)\n      同时代起源\n      推广')
  })

  it('add-child：空文档在 header 后创建根节点', () => {
    const result = applyEdit('mindmap\n', mindmapParser, {
      type: 'add-child',
      text: '中心主题',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('mindmap\n  中心主题\n')
  })

  it('delete-node：删除节点连同其子树与图标行，不留残行', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'delete-node',
      elementId: 'mindmap-node:3',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('长历史')
    expect(result.source).not.toContain('::icon(fa fa-book)')
    expect(result.source).toContain('    起源\n      推广')
    expect(result.source).toContain('    研究方向')
  })

  it('delete-node：删除根节点连带全部后代', () => {
    const result = applyEdit(FULL_COVERAGE, mindmapParser, {
      type: 'delete-node',
      elementId: 'mindmap-node:1',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 注释与空行是 verbatim，不随节点删除
    expect(result.source).toBe('mindmap\n      %% 一条注释，必须逐字保留\n\n')
  })
})
