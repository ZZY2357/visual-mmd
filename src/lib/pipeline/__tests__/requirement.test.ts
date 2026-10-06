import { describe, expect, it } from 'vitest'
import { reassemble, type SourceDocument } from '../document'
import {
  isSafelyUnquotedRequirementValue,
  isValidRequirementFieldValue,
  isValidRequirementName,
  normalizeRelation,
  requirementParser,
  REQUIREMENT_DIRECTIONS,
  REQUIREMENT_RELATION_KINDS,
  REQUIREMENT_TYPES,
  type RequirementDirectionData,
  type RequirementElementBlockData,
  type RequirementFieldData,
  type RequirementRelationData,
} from '../requirement'
import { REQUIREMENT_TEMPLATE } from '../../diagram-registry'

/**
 * requirementDiagram 解析器测试（more-diagrams 工单 07）：
 * verbatim identity（ADR-0004/0008）、语法覆盖（requirement/element 块、四+二字段、
 * 关系正反两种写法、direction）、意图落码往返、引号形态契约、非法编辑拒绝。
 */

function parseOk(source: string): SourceDocument {
  const result = requirementParser.parse(source)
  if (!result.ok) throw new Error(`解析失败（${result.error.line}）：${result.error.message}`)
  return result.doc
}

function elementsOf(doc: SourceDocument, kind: string) {
  return doc.elements.filter((p) => p.element.kind === kind)
}

const SIMPLE = `requirementDiagram
    direction LR

    functionalRequirement login {
        id: "REQ-1"
        text: "用户可使用账号密码登录"
        risk: Medium
        verifymethod: Test
    }

    element loginUI {
        type: "登录界面"
        docref: "docs/ui.md"
    }

    loginUI - satisfies -> login
    auth <- traces - loginUI
`

describe('requirementDiagram 解析器：verbatim identity（ADR-0004）', () => {
  it('解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parseOk(SIMPLE), new Map())).toBe(SIMPLE)
  })

  it('起步模板同样逐字还原，且可被 detect 命中', () => {
    expect(reassemble(parseOk(REQUIREMENT_TEMPLATE), new Map())).toBe(REQUIREMENT_TEMPLATE)
  })

  it('清单外语法（frontmatter / 注释 / 空行 / 生僻行）逐字保留', () => {
    const source = `---
title: x
---
requirementDiagram
    %% 注释

    ??? 生僻 ???
    requirement r1 {
        id: "1"
    }
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })
})

describe('requirementDiagram 解析器：语法覆盖（分层对齐核心清单）', () => {
  it('表头：`requirementDiagram` 声明 + direction 四方向', () => {
    expect(elementsOf(parseOk('requirementDiagram\n'), 'requirement-header')).toHaveLength(1)
    for (const dir of REQUIREMENT_DIRECTIONS) {
      const doc = parseOk(`requirementDiagram\n    direction ${dir}\n`)
      const directions = elementsOf(doc, 'requirement-direction')
      expect(directions).toHaveLength(1)
      expect((directions[0].element as RequirementDirectionData).value).toBe(dir)
      expect(reassemble(doc, new Map())).toBe(`requirementDiagram\n    direction ${dir}\n`)
    }
  })

  it('requirement 块：六种 type 都能声明，四字段各自解析（值去引号、记录 quoted）', () => {
    for (const type of REQUIREMENT_TYPES) {
      const doc = parseOk(`requirementDiagram\n    ${type} r1 {\n        id: "1"\n    }\n`)
      const blocks = elementsOf(doc, 'requirement')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].element).toMatchObject({ kind: 'requirement', type, name: 'r1' })
    }
    const doc = parseOk(SIMPLE)
    const block = elementsOf(doc, 'requirement')[0]
    expect(block.element).toMatchObject({ kind: 'requirement', type: 'functionalRequirement', name: 'login' })
    // 只取该块区间内的字段行（element 块的字段在后面，按 span 过滤）
    const fields = elementsOf(doc, 'requirement-field')
      .filter((p) => p.span.start > block.span.start)
      .slice(0, 4)
      .map((p) => p.element as RequirementFieldData)
    expect(fields.map((f) => [f.field, f.value, f.quoted])).toEqual([
      ['id', 'REQ-1', true],
      ['text', '用户可使用账号密码登录', true],
      ['risk', 'Medium', false],
      ['verifymethod', 'Test', false],
    ])
  })

  it('element 块：type / docref 两字段', () => {
    const doc = parseOk(SIMPLE)
    const blockPart = elementsOf(doc, 'requirement-element')[0]
    const block = blockPart.element as RequirementElementBlockData
    expect(block).toMatchObject({ kind: 'requirement-element', name: 'loginUI' })
    const fields = elementsOf(doc, 'requirement-field').filter((p) => p.span.start > blockPart.span.start)
    expect(fields.map((f) => (f.element as RequirementFieldData).field)).toEqual(['type', 'docref'])
  })

  it('关系：正向 `a - kind -> b` 与反向 `b <- kind - a` 都解析，kind 七种全认', () => {
    for (const kind of REQUIREMENT_RELATION_KINDS) {
      const doc = parseOk(`requirementDiagram\n    a - ${kind} -> b\n`)
      const rel = normalizeRelation(elementsOf(doc, 'requirement-relation')[0].element as RequirementRelationData)
      expect(rel).toMatchObject({ from: 'a', to: 'b', relationKind: kind, reversed: false })
    }
    const doc = parseOk(SIMPLE)
    const rels = elementsOf(doc, 'requirement-relation').map((p) => normalizeRelation(p.element as RequirementRelationData))
    expect(rels[0]).toMatchObject({ from: 'loginUI', to: 'login', relationKind: 'satisfies', reversed: false })
    // 反向写法归一为语义 from→to，reversed 如实保留
    expect(rels[1]).toMatchObject({ from: 'loginUI', to: 'auth', relationKind: 'traces', reversed: true })
  })
})

describe('requirementDiagram 解析器：值合法性口径', () => {
  it('isValidRequirementName / isValidRequirementFieldValue 拒绝破坏语法的值', () => {
    expect(isValidRequirementName('r1')).toBe(true)
    expect(isValidRequirementName('')).toBe(false)
    expect(isValidRequirementName('a b')).toBe(false)
    expect(isValidRequirementFieldValue('普通文本')).toBe(true)
    expect(isValidRequirementFieldValue('含"引号')).toBe(false)
    expect(isValidRequirementFieldValue('含\n换行')).toBe(false)
  })

  it('isSafelyUnquotedRequirementValue：禁字符 / 关键字词要引号；字段枚举值天然裸写', () => {
    expect(isSafelyUnquotedRequirementValue('text', '普通文本')).toBe(true)
    expect(isSafelyUnquotedRequirementValue('text', '含-横线')).toBe(false)
    expect(isSafelyUnquotedRequirementValue('text', 'risk')).toBe(false) // 关键字词
    expect(isSafelyUnquotedRequirementValue('risk', 'High')).toBe(true) // 字段自身枚举放行
    expect(isSafelyUnquotedRequirementValue('text', '#开头')).toBe(false)
  })
})

describe('requirementDiagram 解析器：意图落码往返', () => {
  it('add-requirement：追加空块（可再解析），锚点插入落在锚点之后', () => {
    const doc = parseOk(SIMPLE)
    const appended = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'add-requirement', requirementType: 'performanceRequirement', name: 'perf1' })!)
    expect(appended).toContain('performanceRequirement perf1')
    expect(parseOk(appended)).toBeDefined()

    const anchored = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'add-requirement', requirementType: 'performanceRequirement', name: 'perf1', afterElementId: 'requirement:login' })!)
    const lines = anchored.split('\n')
    // 块声明锚点会重锚到块闭合行之后：新块插在 login 块**外**（不落进块体内部）
    const loginEnd = lines.findIndex((l) => l.trim() === '}')
    expect(lines[loginEnd + 1]).toContain('performanceRequirement perf1')
    expect(lines[loginEnd + 2]).toBe('    }')
  })

  it('add-requirement：重名 / 非法 type / 非法名拒绝落码', () => {
    const doc = parseOk(SIMPLE)
    expect(requirementParser.resolveRewrites(doc, { type: 'add-requirement', requirementType: 'functionalRequirement', name: 'login' })).toBeNull()
    expect(requirementParser.resolveRewrites(doc, { type: 'add-requirement', requirementType: 'NOPE', name: 'r2' })).toBeNull()
    expect(requirementParser.resolveRewrites(doc, { type: 'add-requirement', requirementType: 'functionalRequirement', name: 'a b' })).toBeNull()
  })

  it('add-element：追加空块；重名拒绝', () => {
    const doc = parseOk(SIMPLE)
    const next = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'add-element', name: 'backend' })!)
    expect(next).toContain('element backend')
    expect(parseOk(next)).toBeDefined()
    expect(requirementParser.resolveRewrites(doc, { type: 'add-element', name: 'loginUI' })).toBeNull()
  })

  it('set-requirement-field：改已有字段原地重写，其余行逐字节不动（ADR-0004）', () => {
    const doc = parseOk(SIMPLE)
    const next = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-requirement-field', requirement: 'login', field: 'text', value: '新描述' })!)
    const before = SIMPLE.split('\n')
    const after = next.split('\n')
    expect(after.filter((l) => l.includes('text:')).length).toBe(1)
    expect(next).toContain('text: "新描述"')
    // id 行与块外内容逐字不动
    expect(after[before.findIndex((l) => l.includes('id:'))]).toBe(before[before.findIndex((l) => l.includes('id:'))])
    expect(parseOk(next)).toBeDefined()
  })

  it('set-requirement-field：引号形态契约——原带引号改后仍带；原裸写改后不安全则自动补引号', () => {
    const doc = parseOk(SIMPLE)
    // text 原本带引号 → 新值仍带引号
    const quoted = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-requirement-field', requirement: 'login', field: 'text', value: '含-横线' })!)
    expect(quoted).toContain('text: "含-横线"')
    // risk 原本裸写、枚举值天然安全 → 仍裸写
    const bare = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-requirement-field', requirement: 'login', field: 'risk', value: 'High' })!)
    expect(bare).toContain('risk: High')
    // element 的 type 原本带引号 → 保持带引号
    const elementType = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-element-field', element: 'loginUI', field: 'type', value: '后端服务' })!)
    expect(elementType).toContain('type: "后端服务"')
  })

  it('set-requirement-field：新增字段插到 `}` 之前（缩进跟随），value null 删行', () => {
    const doc = parseOk(SIMPLE)
    const added = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-element-field', element: 'loginUI', field: 'docref', value: null })!)
    expect(added).not.toContain('docref:')
    expect(parseOk(added)).toBeDefined()
    // 已删的 docref 再写回 = 新增（插到 `}` 之前；新值的裸写安全性由管线判定）
    const restored = reassemble(parseOk(added), requirementParser.resolveRewrites(parseOk(added), { type: 'set-element-field', element: 'loginUI', field: 'docref', value: 'docs/x.md' })!)
    expect(restored).toContain('docref: docs/x.md')
    expect(parseOk(restored)).toBeDefined()
  })

  it('set-requirement-field：不存在的块 / 清单外字段 / 非法值拒绝落码', () => {
    const doc = parseOk(SIMPLE)
    expect(requirementParser.resolveRewrites(doc, { type: 'set-requirement-field', requirement: 'nope', field: 'text', value: 'x' })).toBeNull()
    expect(requirementParser.resolveRewrites(doc, { type: 'set-requirement-field', requirement: 'login', field: 'docref', value: 'x' })).toBeNull()
    expect(requirementParser.resolveRewrites(doc, { type: 'set-element-field', element: 'loginUI', field: 'risk', value: 'x' })).toBeNull()
    expect(requirementParser.resolveRewrites(doc, { type: 'set-requirement-field', requirement: 'login', field: 'text', value: '含"引号' })).toBeNull()
  })

  it('delete-requirement：块体 + 触及关系级联删除，其余内容逐字不动', () => {
    const doc = parseOk(SIMPLE)
    const next = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'delete-requirement', name: 'login' })!)
    expect(next).not.toContain('functionalRequirement login')
    expect(next).not.toContain('satisfies')
    expect(next).toContain('element loginUI')
    expect(next).toContain('auth <- traces - loginUI')
    expect(parseOk(next)).toBeDefined()
    expect(requirementParser.resolveRewrites(doc, { type: 'delete-requirement', name: 'nope' })).toBeNull()
  })

  it('add-relation：正反两种写法都落码；非法 kind 拒绝', () => {
    const doc = parseOk(SIMPLE)
    const forward = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'add-relation', from: 'login', to: 'loginUI', relationKind: 'verifies' })!)
    expect(forward).toContain('login - verifies -> loginUI')
    expect(parseOk(forward)).toBeDefined()
    const reversed = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'add-relation', from: 'login', to: 'loginUI', relationKind: 'verifies', reversed: true })!)
    expect(reversed).toContain('loginUI <- verifies - login')
    expect(requirementParser.resolveRewrites(doc, { type: 'add-relation', from: 'a', to: 'b', relationKind: 'NOPE' })).toBeNull()
  })

  it('set-relation：改 kind / 反转书写方向；未知 elementId / 非法 kind 拒绝', () => {
    const doc = parseOk(SIMPLE)
    const relationPart = elementsOf(doc, 'requirement-relation')[0]
    const kindChanged = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-relation', elementId: relationPart.id, changes: { relationKind: 'verifies' } })!)
    expect(kindChanged).toContain('loginUI - verifies -> login')
    const flipped = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-relation', elementId: relationPart.id, changes: { reversed: true } })!)
    // 反转 = 语义反转（from/to 交换），书写换成另一种形式：`语义终点 <- kind - 语义起点`
    expect(flipped).toContain('loginUI <- satisfies - login')
    const flippedDoc = parseOk(flipped)
    const flippedRel = normalizeRelation(elementsOf(flippedDoc, 'requirement-relation')[0].element as RequirementRelationData)
    expect(flippedRel).toMatchObject({ from: 'login', to: 'loginUI', relationKind: 'satisfies', reversed: true })
    expect(parseOk(flipped)).toBeDefined()
    expect(requirementParser.resolveRewrites(doc, { type: 'set-relation', elementId: 'relation:99', changes: { relationKind: 'verifies' } })).toBeNull()
    expect(requirementParser.resolveRewrites(doc, { type: 'set-relation', elementId: relationPart.id, changes: { relationKind: 'NOPE' } })).toBeNull()
  })

  it('delete-relation：只删关系行', () => {
    const doc = parseOk(SIMPLE)
    const relationPart = elementsOf(doc, 'requirement-relation')[1]
    const next = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'delete-relation', elementId: relationPart.id })!)
    expect(next).not.toContain('traces')
    expect(next).toContain('satisfies')
    expect(parseOk(next)).toBeDefined()
  })

  it('set-direction：改写已有行 / 无行时插到表头后 / null 删除行；非法方向拒绝', () => {
    const doc = parseOk(SIMPLE)
    const changed = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-direction', direction: 'TB' })!)
    expect(changed).toContain('direction TB')
    expect(changed).not.toContain('direction LR')

    const bare = parseOk('requirementDiagram\n    requirement r1 {\n        id: "1"\n    }\n')
    const inserted = reassemble(bare, requirementParser.resolveRewrites(bare, { type: 'set-direction', direction: 'RL' })!)
    // 插入行缩进跟随表头（表头顶格 → 顶格插入；mermaid 对缩进不敏感）
    expect(inserted.split('\n')[1]).toBe('direction RL')

    const removed = reassemble(doc, requirementParser.resolveRewrites(doc, { type: 'set-direction', direction: null })!)
    expect(removed).not.toContain('direction')
    expect(requirementParser.resolveRewrites(doc, { type: 'set-direction', direction: 'XX' })).toBeNull()
  })
})

describe('requirementDiagram 解析器：错误边界', () => {
  it('非 requirementDiagram 开头 / 多余的 } 报错且带行号', () => {
    expect(requirementParser.parse('flowchart TB\nn1[甲]').ok).toBe(false)
    const stray = requirementParser.parse('requirementDiagram\n    }\n')
    expect(stray.ok).toBe(false)
    if (!stray.ok) expect(stray.error.line).toBe(2)
  })

  it('requirementDiagram_v2 已不存在（v12 移除），不得误认', () => {
    expect(requirementParser.parse('requirementDiagram_v2\n').ok).toBe(false)
  })
})
