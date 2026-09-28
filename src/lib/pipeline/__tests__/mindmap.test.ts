import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { mindmapParser, type MindmapIntent, type MindmapShapeType } from '../mindmap'
import { reassemble } from '../document'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'

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

// ---------- 节点 ID 与显示文本分离（工单 05，ADR-0009） ----------

/**
 * root 已有 id 与圆形；起源带 ::icon；`User Input` 是含空格的纯文本；
 * `[方形]` 是用户自选方框；`myid(圆角)` 已分离（id + 圆角）。
 * 节点编号：1=root 2=起源 3=User Input 4=[方形] 5=myid(圆角)（图标行不占编号）
 */
const ID_SOURCE = `mindmap
  root((思维导图))
    起源
      ::icon(fa fa-book)
    User Input
    [方形]
    myid(圆角)
`

function applyIdIntent(source: string, intent: MindmapIntent): string {
  const result = applyEdit(source, mindmapParser, intent)
  if (!result.ok) throw new Error('意图未能应用')
  return result.source
}

describe('节点 ID 与显示文本分离（mindmap，工单 05）', () => {
  it('设 id：纯文本节点 → id[显示文本]，显示文本含空格逐字保留', () => {
    const next = applyIdIntent(ID_SOURCE, { type: 'set-node-id', elementId: 'mindmap-node:3', id: 'UserNewInput' })
    expect(next).toContain('    UserNewInput[User Input]')
    // 未触碰文本逐字保留（verbatim identity）
    expect(next).toBe(ID_SOURCE.replace('    User Input', '    UserNewInput[User Input]'))
  })

  it('设 id：原本无形状 → 默认方框 []', () => {
    const next = applyIdIntent('mindmap\n  新节点\n', { type: 'set-node-id', elementId: 'mindmap-node:1', id: 'NewId' })
    expect(next).toBe('mindmap\n  NewId[新节点]\n')
  })

  it('设 id：已有形状保留（((圆)) → id((圆))）', () => {
    const next = applyIdIntent('mindmap\n  ((圆))\n', { type: 'set-node-id', elementId: 'mindmap-node:1', id: 'id' })
    expect(next).toBe('mindmap\n  id((圆))\n')
  })

  it('设 id：用户自选方框不叠加（[方形] → sq[方形]）', () => {
    const next = applyIdIntent(ID_SOURCE, { type: 'set-node-id', elementId: 'mindmap-node:4', id: 'sq' })
    expect(next).toContain('    sq[方形]')
    expect(next).not.toContain('sq[[方形]]')
  })

  it('设 id：::icon 行不受影响', () => {
    const next = applyIdIntent(ID_SOURCE, { type: 'set-node-id', elementId: 'mindmap-node:2', id: 'origin' })
    expect(next).toContain('    origin[起源]\n      ::icon(fa fa-book)\n')
  })

  it('改 id：只换前缀，显示文本与形状不动', () => {
    const next = applyIdIntent(ID_SOURCE, { type: 'set-node-id', elementId: 'mindmap-node:5', id: 'other' })
    expect(next).toContain('    other(圆角)')
    expect(next).not.toContain('myid(圆角)')
    expect(next).toContain('  root((思维导图))')
  })

  it('改 id：圆（((…))）节点的 id 前缀可替换', () => {
    const next = applyIdIntent(ID_SOURCE, { type: 'set-node-id', elementId: 'mindmap-node:1', id: 'newroot' })
    expect(next).toContain('  newroot((思维导图))')
    expect(next).not.toContain('  root((思维导图))')
  })

  it('改显示文本（画布内联编辑对象）：分离节点的 id 与形状保留', () => {
    const next = applyIdIntent('mindmap\n  myid[My Label]\n', {
      type: 'set-node-text',
      elementId: 'mindmap-node:1',
      text: '新标签',
    })
    expect(next).toBe('mindmap\n  myid[新标签]\n')
  })

  it('清 id：还原纯文本节点（分离引入的方框一并去掉）', () => {
    const next = applyIdIntent('mindmap\n  UserNewInput[User Input]\n', {
      type: 'set-node-id',
      elementId: 'mindmap-node:1',
      id: null,
    })
    expect(next).toBe('mindmap\n  User Input\n')
  })

  it('清 id：圆角等用户自选形状保留', () => {
    const next = applyIdIntent('mindmap\n  myid(圆角)\n', { type: 'set-node-id', elementId: 'mindmap-node:1', id: null })
    expect(next).toBe('mindmap\n  (圆角)\n')
  })

  it('清 id：根节点圆形保留（root((思维导图)) → ((思维导图))）', () => {
    const next = applyIdIntent(ID_SOURCE, { type: 'set-node-id', elementId: 'mindmap-node:1', id: null })
    expect(next).toContain('  ((思维导图))')
    // 其余节点逐字不变，id 变更不触碰其它行
    expect(next).toContain('    User Input\n')
    expect(next).toContain('    myid(圆角)\n')
  })

  it('设 / 清往返：新增的 id 前缀可完全撤销（未触碰文本逐字不变）', () => {
    const withId = applyIdIntent(ID_SOURCE, { type: 'set-node-id', elementId: 'mindmap-node:3', id: 'UserNewInput' })
    const cleared = applyIdIntent(withId, { type: 'set-node-id', elementId: 'mindmap-node:3', id: null })
    expect(cleared).toBe(ID_SOURCE)
  })

  it('非法 id（空白 / 圆括号 / 方括号 / 花括号）拒绝应用', () => {
    for (const bad of ['Bad Id', ' lead', 'trail ', 'a(b', 'a)b', 'a[b', 'a]b', 'a{b', 'a}b', 'a\tb']) {
      const result = applyEdit(ID_SOURCE, mindmapParser, {
        type: 'set-node-id',
        elementId: 'mindmap-node:3',
        id: bad,
      })
      expect(result.ok, `id=${JSON.stringify(bad)} 应被拒绝`).toBe(false)
    }
  })

  it('id 未变 / 无 id 可清 / 目标不存在：均拒绝（不产生快照）', () => {
    // node:1 的 id 已是 'root'，原值重设是空操作
    expect(applyEdit(ID_SOURCE, mindmapParser, { type: 'set-node-id', elementId: 'mindmap-node:1', id: 'root' }).ok).toBe(false)
    // node:3 是纯文本节点，无 id 可清
    expect(applyEdit(ID_SOURCE, mindmapParser, { type: 'set-node-id', elementId: 'mindmap-node:3', id: null }).ok).toBe(false)
    expect(applyEdit(ID_SOURCE, mindmapParser, { type: 'set-node-id', elementId: 'mindmap-node:99', id: 'x' }).ok).toBe(false)
  })

  it('重名允许：两个节点可以共用同一个 id', () => {
    let next = applyIdIntent('mindmap\n  甲\n  乙\n', { type: 'set-node-id', elementId: 'mindmap-node:1', id: 'dup' })
    next = applyIdIntent(next, { type: 'set-node-id', elementId: 'mindmap-node:2', id: 'dup' })
    expect(next).toBe('mindmap\n  dup[甲]\n  dup[乙]\n')
  })

  it('id 变更不影响位置序寻址：元素 id 与数量不变', () => {
    const parsed = mindmapParser.parse(ID_SOURCE)
    if (!parsed.ok) throw new Error('解析失败')
    const before = parsed.doc.elements.map((p) => p.id)
    const parsed2 = mindmapParser.parse(
      applyIdIntent(ID_SOURCE, { type: 'set-node-id', elementId: 'mindmap-node:2', id: 'origin' }),
    )
    if (!parsed2.ok) throw new Error('解析失败')
    expect(parsed2.doc.elements.map((p) => p.id)).toEqual(before)
  })

  it('撤销 / 重做覆盖设 id 与清 id（commitIntent 快照栈）', () => {
    const base = 'mindmap\n  User Input\n'
    resetEditorHistory(base)
    const store = () => useEditorStore.getState()
    expect(store().commitIntent({ type: 'set-node-id', elementId: 'mindmap-node:1', id: 'UserNewInput' })).toBe(true)
    expect(store().source).toBe('mindmap\n  UserNewInput[User Input]\n')
    expect(store().commitIntent({ type: 'set-node-id', elementId: 'mindmap-node:1', id: null })).toBe(true)
    expect(store().source).toBe(base)
    store().undo()
    expect(store().source).toBe('mindmap\n  UserNewInput[User Input]\n')
    store().undo()
    expect(store().source).toBe(base)
    store().redo()
    expect(store().source).toBe('mindmap\n  UserNewInput[User Input]\n')
    store().redo()
    expect(store().source).toBe(base)
  })
})
