import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { applyEdit } from '../pipeline'
import { MINDMAP_TEMPLATE } from '../../diagram-registry'
import { mindmapParser } from '../mindmap'

/**
 * 金样合法性（工单 08）：mindmap 管线产出的源码必须能被 mermaid v12
 * 实际 parse 通过；模板本身也必须是能跑通的示例图。
 */
describe('金样合法性（mindmap）', () => {
  it('模板本身 parse 通过', async () => {
    await expect(mermaid.parse(MINDMAP_TEMPLATE)).resolves.toBeTruthy()
  })

  it('全部节点形状 + ::icon() 的源码 parse 通过', async () => {
    const src = `mindmap
  root((中心))
    [方形]
    (圆角)
    ((圆))
    ))爆炸((
    )云(
    {{六边形}}
    带图标
      ::icon(fa fa-book)
`
    await expect(mermaid.parse(src)).resolves.toBeTruthy()
  })

  it('set-node-shape / set-node-icon / add-child / add-sibling / delete-node 产物 parse 通过', async () => {
    const step1 = applyEdit(MINDMAP_TEMPLATE, mindmapParser, {
      type: 'set-node-shape',
      elementId: 'mindmap-node:2',
      shape: 'bang',
    })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    await expect(mermaid.parse(step1.source)).resolves.toBeTruthy()

    const step2 = applyEdit(step1.source, mindmapParser, {
      type: 'set-node-icon',
      elementId: 'mindmap-node:3',
      icon: 'fa fa-book',
    })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    await expect(mermaid.parse(step2.source)).resolves.toBeTruthy()

    const step3 = applyEdit(step2.source, mindmapParser, {
      type: 'add-child',
      parentElementId: 'mindmap-node:2',
      text: '爆炸细节',
    })
    expect(step3.ok).toBe(true)
    if (!step3.ok) return
    await expect(mermaid.parse(step3.source)).resolves.toBeTruthy()

    const step4 = applyEdit(step3.source, mindmapParser, {
      type: 'add-sibling',
      elementId: 'mindmap-node:3',
      text: '兄弟主题',
    })
    expect(step4.ok).toBe(true)
    if (!step4.ok) return
    await expect(mermaid.parse(step4.source)).resolves.toBeTruthy()

    const step5 = applyEdit(step4.source, mindmapParser, {
      type: 'delete-node',
      elementId: 'mindmap-node:3',
    })
    expect(step5.ok).toBe(true)
    if (!step5.ok) return
    await expect(mermaid.parse(step5.source)).resolves.toBeTruthy()
    expect(step5.source).not.toContain('fa fa-book')
    expect(step5.source).toContain('::icon(fa fa-database)')
  })

  it('set-node-id 产物（NewId[新节点] / id((圆))）parse 通过，清除 id 后也通过', async () => {
    // 无形状节点设 id → 默认方框
    const step1 = applyEdit('mindmap\n  新节点\n', mindmapParser, {
      type: 'set-node-id',
      elementId: 'mindmap-node:1',
      id: 'NewId',
    })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    expect(step1.source).toContain('NewId[新节点]')
    await expect(mermaid.parse(step1.source)).resolves.toBeTruthy()

    // 清除 id → 还原纯文本节点
    const step2 = applyEdit(step1.source, mindmapParser, {
      type: 'set-node-id',
      elementId: 'mindmap-node:1',
      id: null,
    })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    expect(step2.source).toContain('  新节点')
    await expect(mermaid.parse(step2.source)).resolves.toBeTruthy()

    // 有形状节点设 id → 形状保留
    const step3 = applyEdit('mindmap\n  ((圆))\n', mindmapParser, {
      type: 'set-node-id',
      elementId: 'mindmap-node:1',
      id: 'id',
    })
    expect(step3.ok).toBe(true)
    if (!step3.ok) return
    expect(step3.source).toContain('id((圆))')
    await expect(mermaid.parse(step3.source)).resolves.toBeTruthy()

    // 重名 id 也合法（mermaid 实测接受；同为根的儿子即可）
    const dupSource = 'mindmap\n  root\n    a[x]\n    a[y]\n'
    const step4 = applyEdit(dupSource, mindmapParser, { type: 'set-node-id', elementId: 'mindmap-node:3', id: 'a' })
    expect(step4.ok).toBe(false) // id 已是 a，空操作拒绝
    await expect(mermaid.parse(dupSource)).resolves.toBeTruthy()
  })
})
