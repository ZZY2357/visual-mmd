import { describe, expect, it } from 'vitest'
import { gitgraphParser } from '../../pipeline/gitgraph'
import { buildGitgraphProjection } from '../../projection/gitgraph-projection'
import { gitgraphCanvasCapabilities } from '../../canvas-selection/gitgraph-adapter'
import { gitgraphDeleteIntent, gitgraphKeyPlan } from '../../pipeline/gitgraph-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { EditIntent } from '../../pipeline/parser'
import type { Selection } from '../../projection/selection'

/**
 * gitGraph 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 04，ADR-0013）：
 * 提交上 Tab = 当前分支加提交、Enter = 加分支、Delete = 删除；
 * 画布 DOM 无 data-id（实测降级）→ 画布点选不产生选中，结构树是完整入口。
 */

const SOURCE = `gitGraph
    commit id: "init"
    commit id: "docs"
    branch feature
    commit
    checkout main
`

function projectionOf(source: string) {
  const parsed = gitgraphParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildGitgraphProjection(parsed.doc)
}

describe('gitgraphKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('提交上 Tab = 当前分支加一个提交（锚点插入在选中提交之后），选中预测的新提交', () => {
    const plan = gitgraphKeyPlan(projection, { key: 'Tab', selection: { kind: 'gitgraph-commit', elementId: 'commit:2' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([{ type: 'add-commit', afterElementId: 'commit:2' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'gitgraph-commit', elementId: 'commit:3' } })
  })

  it('提交上 Enter = 加分支（自动避重命名），选中新分支', () => {
    const plan = gitgraphKeyPlan(projection, { key: 'Enter', selection: { kind: 'gitgraph-commit', elementId: 'commit:1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([{ type: 'add-branch', name: 'dev', afterElementId: 'commit:1' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'gitgraph-branch', name: 'dev' } })
  })

  it('Delete = 删除选中元素（唯一映射）；分支 / merge / cherry-pick 同理', () => {
    expect(gitgraphKeyPlan(projection, { key: 'Delete', selection: { kind: 'gitgraph-commit', elementId: 'commit:1' } })).toEqual({
      intents: [{ type: 'delete-commit', elementId: 'commit:1' }],
      clearSelection: true,
    })
    expect(gitgraphKeyPlan(projection, { key: 'Delete', selection: { kind: 'gitgraph-branch', name: 'feature' } })).toEqual({
      intents: [{ type: 'delete-branch', name: 'feature' }],
      clearSelection: true,
    })
  })

  it('无选中 / 别种选中 / 非提交上 Tab·Enter / Shift 修饰 → null（不 preventDefault）', () => {
    expect(gitgraphKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(gitgraphKeyPlan(projection, { key: 'Tab', selection: { kind: 'gitgraph-branch', name: 'feature' } })).toBeNull()
    expect(gitgraphKeyPlan(projection, { key: 'Enter', selection: { kind: 'node', nodeId: 'A' } })).toBeNull()
    expect(
      gitgraphKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'gitgraph-commit', elementId: 'commit:1' } }),
    ).toBeNull()
  })
})

describe('gitgraphDeleteIntent', () => {
  const projection = projectionOf(SOURCE)
  it('四类元素各映射到 delete-* 意图；已不在投影 / null / 别种选中 → null', () => {
    expect(gitgraphDeleteIntent(projection, { kind: 'gitgraph-commit', elementId: 'commit:1' })).toEqual({
      type: 'delete-commit',
      elementId: 'commit:1',
    })
    expect(gitgraphDeleteIntent(projection, { kind: 'gitgraph-branch', name: 'feature' })).toEqual({
      type: 'delete-branch',
      name: 'feature',
    })
    expect(gitgraphDeleteIntent(projection, { kind: 'gitgraph-commit', elementId: 'commit:99' })).toBeNull()
    expect(gitgraphDeleteIntent(projection, { kind: 'gitgraph-branch', name: 'GONE' })).toBeNull()
    expect(gitgraphDeleteIntent(projection, null)).toBeNull()
  })
})

describe('gitGraph 右键菜单（空白添加入口）', () => {
  it('空白 = 加提交 / 加分支（画布 DOM 无 data-id，无元素级菜单目标）', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'gitgraph' })).toEqual(['add-commit', 'add-branch'])
  })

  it('画布选中 → 菜单目标恒为 null（data-id 降级）', () => {
    expect(menuTargetOfCanvas('gitgraph', { kind: 'node', id: 'x' })).toBeNull()
    expect(menuTargetOfCanvas('gitgraph', { kind: 'element', elementId: 'commit:1' })).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'x' }, 'gitgraph')).toBeNull()
  })

  it('fromCanvasId 不产生编辑器选中（画布点选降级）', () => {
    expect(fromCanvasId('gitgraph', { kind: 'node', id: 'x' })).toBeNull()
    expect(fromCanvasId('gitgraph', { kind: 'element', elementId: 'commit:1' })).toBeNull()
  })
})

describe('gitgraphCanvasCapabilities（画布能力包降级项）', () => {
  const projection = { type: 'gitgraph' as const, gitgraph: projectionOf(SOURCE) }
  const caps = gitgraphCanvasCapabilities

  it('无画布可寻址元素：resolver 恒 null / toSelection·canvasIdOf 恒 null / navigationIds 空', () => {
    const resolver = caps.dataIdResolver(projection)
    expect(resolver('commit:1')).toBeNull()
    expect(resolver('node_0')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'x' })).toBeNull()
    expect(caps.canvasIdOf(projection, { kind: 'gitgraph-commit', elementId: 'commit:1' })).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
  })

  it('keyboardProjection 字段名与图种 id 同名；resolveSelection / deleteIntent 走投影', () => {
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'gitgraph', projection: projection.gitgraph })
    expect(caps.resolveSelection(projection, { kind: 'gitgraph-commit', elementId: 'commit:1' })).toEqual({
      kind: 'gitgraph-commit',
      elementId: 'commit:1',
    })
    expect(caps.deleteIntent(projection, { kind: 'gitgraph-commit', elementId: 'commit:1' })).toEqual({
      type: 'delete-commit',
      elementId: 'commit:1',
    })
  })

  it('无连线语法：不实现可选成员 edgeAnnotator', () => {
    expect(caps.edgeAnnotator).toBeUndefined()
  })

  it('capabilitiesOf 查表命中 GitgraphProjection 包装', () => {
    expect(capabilitiesOf(projection)).toBe(gitgraphCanvasCapabilities)
  })
})

describe('gitGraph 空白菜单动作（add-commit / add-branch）', () => {
  function fakeCtx() {
    const intents: EditIntent[] = []
    const selections: (Selection | null)[] = []
    let closed = 0
    const ctx: MenuActionContext = {
      projection: { type: 'gitgraph', gitgraph: projectionOf(SOURCE) },
      selection: null,
      commitIntent: (intent) => {
        intents.push(intent)
        return true
      },
      select: (s) => selections.push(s),
      openForm: () => {},
      openStyleForm: () => {},
      beginInlineEdit: () => {},
      enterLinkMode: () => {},
      newNodeText: '新节点',
      close: () => {
        closed += 1
      },
    }
    return { ctx, intents, selections, get closed() { return closed } }
  }

  it('add-commit：追加提交意图 + 选中预测的新提交 + 关菜单', () => {
    const f = fakeCtx()
    MENU_ACTIONS['add-commit'](f.ctx, { kind: 'blank', diagramType: 'gitgraph' })
    expect(f.intents).toEqual([{ type: 'add-commit' }])
    expect(f.selections).toEqual([{ kind: 'gitgraph-commit', elementId: 'commit:4' }])
    expect(f.closed).toBe(1)
  })

  it('add-branch：自动命名（dev）避重 + 选中新分支 + 关菜单', () => {
    const f = fakeCtx()
    MENU_ACTIONS['add-branch'](f.ctx, { kind: 'blank', diagramType: 'gitgraph' })
    expect(f.intents).toEqual([{ type: 'add-branch', name: 'dev' }])
    expect(f.selections).toEqual([{ kind: 'gitgraph-branch', name: 'dev' }])
    expect(f.closed).toBe(1)
  })
})

describe('gitGraph 注册表挂载', () => {
  it('detect / template / 模板可解析为非空投影', () => {
    expect(DIAGRAM_TYPES.gitgraph.detect('gitGraph\n    commit\n')).toBe(true)
    expect(DIAGRAM_TYPES.gitgraph.detect('gitGraph LR:\n')).toBe(true)
    expect(DIAGRAM_TYPES.gitgraph.detect('flowchart TD\n')).toBe(false)
    expect(DIAGRAM_TYPES.gitgraph.detect('gitGraphX\n')).toBe(false)

    const parsed = DIAGRAM_TYPES.gitgraph.parser.parse(DIAGRAM_TYPES.gitgraph.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = DIAGRAM_TYPES.gitgraph.buildProjection(parsed.doc)
    if (projection.type !== 'gitgraph') throw new Error('图种必须为 gitgraph')
    expect(projection.gitgraph.commits.length).toBeGreaterThan(0)
    expect(projection.gitgraph.branches.length).toBeGreaterThan(1)
    expect(projection.gitgraph.merges.length).toBeGreaterThan(0)
  })
})
