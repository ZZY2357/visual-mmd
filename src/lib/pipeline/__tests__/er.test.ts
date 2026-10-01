import { describe, expect, it } from 'vitest'
import { reassemble, type SourceDocument } from '../document'
import {
  erParser,
  isValidErName,
  parseErKeys,
  ER_CARD_LEFT_OF,
  ER_CARD_RIGHT_OF,
  erCardinalityOf,
} from '../er'
import { ER_TEMPLATE } from '../../diagram-registry'

/**
 * erDiagram 解析器测试（more-diagrams 工单 03）：
 * verbatim identity（ADR-0004/0008）、核心语法覆盖、意图落码。
 */

function parseOk(source: string): SourceDocument {
  const result = erParser.parse(source)
  if (!result.ok) throw new Error(`解析失败（${result.error.line}）：${result.error.message}`)
  return result.doc
}

const SIMPLE = `erDiagram
    direction LR

    CAR {
        string make PK "制造商"
        string model "型号"
        int? year
    }
    DRIVER

    CAR ||--|{ DRIVER : "drives"
    DRIVER }|..|{ CAR : insured
`

describe('er 解析器：verbatim identity（ADR-0004）', () => {
  it('解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parseOk(SIMPLE), new Map())).toBe(SIMPLE)
  })

  it('起步模板同样逐字还原', () => {
    expect(reassemble(parseOk(ER_TEMPLATE), new Map())).toBe(ER_TEMPLATE)
  })

  it('清单外语法（style / classDef / 注释 / 子图 / frontmatter）逐字保留', () => {
    const source = `---
title: x
---
erDiagram
    %% 注释
    CAR
    style CAR fill:#f9f
    classDef weird font-style:italic
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })

  it('无法识别的行不报错、原样保留（ADR-0008）', () => {
    const source = `erDiagram
    CAR
    ??? 生僻语法 ???
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })
})

describe('er 解析器：语法覆盖（分层对齐核心清单）', () => {
  it('实体声明形态：裸名 / 引号名 / 别名 / 组合', () => {
    const source = `erDiagram
    CAR
    "name with space"
    CAR[alias]
    "name with space"[alias2]
`
    const doc = parseOk(source)
    const entities = doc.elements.filter((p) => p.element.kind === 'er-entity')
    expect(entities).toHaveLength(4)
    expect(entities[0]!.element).toMatchObject({ name: 'CAR', quoted: false, alias: null })
    expect(entities[1]!.element).toMatchObject({ name: 'name with space', quoted: true })
    expect(entities[2]!.element).toMatchObject({ name: 'CAR', alias: 'alias' })
    expect(entities[3]!.element).toMatchObject({ name: 'name with space', alias: 'alias2' })
  })

  it('属性块：类型 / 名 / PK / 可空 / 注释 / `*` 前缀', () => {
    const doc = parseOk(SIMPLE)
    const attrs = doc.elements.filter((p) => p.element.kind === 'er-attribute')
    expect(attrs.map((p) => p.element)).toMatchObject([
      { type: 'string', nullable: false, name: 'make', keysRaw: 'PK', comment: '制造商' },
      { type: 'string', name: 'model', keysRaw: '', comment: '型号' },
      { type: 'int', nullable: true, name: 'year', keysRaw: '', comment: null },
    ])
  })

  it('键组合 PK, FK 与 * 前缀', () => {
    const source = `erDiagram
    CAR {
        string id PK, FK "复合键"
        string *name "星标主键"
    }
`
    const attrs = parseOk(source).elements.filter((p) => p.element.kind === 'er-attribute')
    expect(attrs.map((p) => p.element)).toMatchObject([
      { keysRaw: 'PK, FK', comment: '复合键', star: false },
      { star: true, name: 'name' },
    ])
    expect(parseErKeys('PK, FK')).toEqual(['PK', 'FK'])
  })

  it('关系全家族：基数符号 × 线型任意组合 + 单向标签', () => {
    const source = `erDiagram
    A |o--o| B
    A ||--|| B : exact
    A }o--o{ B
    A }|..|{ B : "multi word"
    A }o..|| B
`
    const relations = parseOk(source).elements.filter((p) => p.element.kind === 'er-relation')
    expect(relations.map((p) => p.element)).toMatchObject([
      { cardLeft: '|o', line: '--', cardRight: 'o|', label: '' },
      { cardLeft: '||', line: '--', cardRight: '||', colonRaw: ' : ', label: 'exact' },
      { cardLeft: '}o', line: '--', cardRight: 'o{' },
      { cardLeft: '}|', line: '..', cardRight: '|{', label: '"multi word"' },
      { cardLeft: '}o', line: '..', cardRight: '||' },
    ])
  })

  it('关系引用自动创建实体（隐式实体无声明行）', () => {
    const doc = parseOk('erDiagram\n    A ||--o{ B : has\n')
    const entities = doc.elements.filter((p) => p.element.kind === 'er-entity')
    expect(entities).toHaveLength(0)
  })
})

describe('er 解析器：意图落码', () => {
  it('add-entity 在文档末尾（最后一个元素之后）落一行声明', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = erParser.resolveRewrites(doc, { type: 'add-entity', name: 'INSURANCE' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('    INSURANCE')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('set-alias 原地改写别名 / 隐式实体补声明', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = erParser.resolveRewrites(doc, { type: 'set-alias', name: 'CAR', alias: '汽车' })
    expect(reassemble(doc, rewrites!)).toContain('CAR[汽车] {')

    const implicit = parseOk('erDiagram\n    A ||--o{ B : has\n')
    const r2 = erParser.resolveRewrites(implicit, { type: 'set-alias', name: 'A', alias: '甲' })
    expect(reassemble(implicit, r2!)).toContain('A[甲]')
  })

  it('delete-entity 级联清理声明、属性块与触及关系', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = erParser.resolveRewrites(doc, { type: 'delete-entity', name: 'CAR' })
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('CAR')
    expect(next).toContain('DRIVER')
    expect(next).not.toContain('make')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('add-attribute：有块实体插到 } 之前，无块实体原地建块，隐式实体补声明 + 块', () => {
    const doc = parseOk(SIMPLE)
    const r1 = erParser.resolveRewrites(doc, {
      type: 'add-attribute',
      entity: 'CAR',
      attrType: 'string',
      name: 'color',
    })
    const next1 = reassemble(doc, r1!)
    expect(next1).toContain('string color')
    expect(next1.indexOf('string color')).toBeLessThan(next1.indexOf('}'))

    const noBlock = parseOk('erDiagram\n    CAR\n    A ||--o{ CAR : has\n')
    const r2 = erParser.resolveRewrites(noBlock, {
      type: 'add-attribute',
      entity: 'CAR',
      attrType: 'int',
      name: 'n',
    })
    const next2 = reassemble(noBlock, r2!)
    expect(next2).toContain('CAR {\n        int n\n    }')

    const implicit = parseOk('erDiagram\n    A ||--o{ B : has\n')
    const r3 = erParser.resolveRewrites(implicit, {
      type: 'add-attribute',
      entity: 'A',
      attrType: 'int',
      name: 'n',
    })
    const next3 = reassemble(implicit, r3!)
    expect(next3).toContain('A {\n        int n\n    }')
    expect(reassemble(parseOk(next3), new Map())).toBe(next3)
  })

  it('set-attribute 增量改写 / delete-attribute 删除行', () => {
    const doc = parseOk(SIMPLE)
    const attr = doc.elements.find((p) => p.element.kind === 'er-attribute' && (p.element as unknown as { name: string }).name === 'make')!
    const r1 = erParser.resolveRewrites(doc, {
      type: 'set-attribute',
      elementId: attr.id,
      changes: { keys: ['PK', 'FK'], nullable: true },
    })
    expect(reassemble(doc, r1!)).toContain('string? make PK, FK')
    const r2 = erParser.resolveRewrites(doc, { type: 'delete-attribute', elementId: attr.id })
    expect(reassemble(doc, r2!)).not.toContain('make')
  })

  it('add-relation / set-relation / delete-relation', () => {
    const doc = parseOk(SIMPLE)
    const r1 = erParser.resolveRewrites(doc, {
      type: 'add-relation',
      from: 'CAR',
      to: 'DRIVER',
      cardLeft: '||',
      line: '--',
      cardRight: '|{',
      label: 'owns',
    })
    expect(reassemble(doc, r1!)).toContain('CAR ||--|{ DRIVER : owns')

    const rel = doc.elements.find((p) => p.element.kind === 'er-relation')!
    const r2 = erParser.resolveRewrites(doc, {
      type: 'set-relation',
      elementId: rel.id,
      changes: { line: '..', label: null },
    })
    expect(reassemble(doc, r2!)).toContain('CAR ||..|{ DRIVER')

    const r3 = erParser.resolveRewrites(doc, { type: 'delete-relation', elementId: rel.id })
    expect(reassemble(doc, r3!)).not.toContain('drives')
  })

  it('set-direction：原地改写 / 新增 / 删除', () => {
    const doc = parseOk(SIMPLE)
    const r1 = erParser.resolveRewrites(doc, { type: 'set-direction', direction: 'TB' })
    expect(reassemble(doc, r1!)).toContain('direction TB')
    const none = parseOk('erDiagram\n    CAR\n')
    const r2 = erParser.resolveRewrites(none, { type: 'set-direction', direction: 'LR' })
    expect(reassemble(none, r2!)).toContain('direction LR')
    const r3 = erParser.resolveRewrites(doc, { type: 'set-direction', direction: null })
    expect(reassemble(doc, r3!)).not.toContain('direction')
  })

  it('非法取值返回 null（不落码）', () => {
    const doc = parseOk(SIMPLE)
    expect(erParser.resolveRewrites(doc, { type: 'add-entity', name: '' })).toBeNull()
    expect(erParser.resolveRewrites(doc, { type: 'add-relation', from: 'A', to: 'B', cardLeft: 'xx', line: '--', cardRight: '||' })).toBeNull()
    expect(erParser.resolveRewrites(doc, { type: 'add-relation', from: 'A', to: 'B', cardLeft: '||', line: '-x', cardRight: '||' })).toBeNull()
  })

  // 工单 29 验收发现：无 keys/comment 的属性行加键时丢分隔空格（`string field` + PK → `string fieldPK`）
  it('无后缀属性行加键：补分隔空格（验收回归）', () => {
    const doc = parseOk('erDiagram\n    CAR {\n        string field\n    }\n')
    const attr = doc.elements.find((p) => p.element.kind === 'er-attribute')!
    const r = erParser.resolveRewrites(doc, {
      type: 'set-attribute',
      elementId: attr.id,
      changes: { keys: ['PK'] },
    })
    expect(reassemble(doc, r!)).toContain('string field PK')
    expect(reassemble(doc, r!)).not.toContain('fieldPK')
  })

  it('无后缀属性行加注释：补分隔空格（验收回归）', () => {
    const doc = parseOk('erDiagram\n    CAR {\n        string field\n    }\n')
    const attr = doc.elements.find((p) => p.element.kind === 'er-attribute')!
    const r = erParser.resolveRewrites(doc, {
      type: 'set-attribute',
      elementId: attr.id,
      changes: { comment: '说明' },
    })
    expect(reassemble(doc, r!)).toContain('string field "说明"')
    expect(reassemble(doc, r!)).not.toContain('field"')
  })

  it('已有后缀属性行改写键：沿用原文空白，不重复补空格', () => {
    const doc = parseOk('erDiagram\n    CAR {\n        string make PK "制造商"\n    }\n')
    const attr = doc.elements.find((p) => p.element.kind === 'er-attribute')!
    const r = erParser.resolveRewrites(doc, {
      type: 'set-attribute',
      elementId: attr.id,
      changes: { keys: ['PK', 'FK'] },
    })
    expect(reassemble(doc, r!)).toContain('string make PK, FK "制造商"')
  })

  // 工单 29 验收发现：以带属性块的实体为锚点拉关系时，关系被插进了实体块内部。
  // UI 契约：编辑层传的锚点是实体的**闭合行**（er-end），见 use-canvas-context-menu。
  it('锚点为实体闭合行：关系落在块之后而非块内部（验收回归）', () => {
    const source = 'erDiagram\n    CAR {\n        string make PK\n    }\n    DRIVER\n'
    const doc = parseOk(source)
    const end = doc.elements.find((p) => p.element.kind === 'er-end')!
    const r = erParser.resolveRewrites(doc, {
      type: 'add-relation',
      afterElementId: end.id,
      from: 'CAR',
      to: 'DRIVER',
      cardLeft: '||',
      line: '--',
      cardRight: '|{',
      label: '引用',
    })
    const out = reassemble(doc, r!)
    expect(out).toBe('erDiagram\n    CAR {\n        string make PK\n    }\n    CAR ||--|{ DRIVER : 引用\n    DRIVER\n')
    expect(out.indexOf('||--|{')).toBeGreaterThan(out.indexOf('}'))
  })

  // 纵深防御：即使锚点误传为「开块实体声明行」，管线也应自行推进到块闭合行之后
  it('锚点误传为开块实体声明行：仍落在块之后（纵深防御）', () => {
    const source = 'erDiagram\n    CAR {\n        string make PK\n    }\n    DRIVER\n'
    const doc = parseOk(source)
    const car = doc.elements.find(
      (p) => p.element.kind === 'er-entity' && (p.element as unknown as { openBrace: boolean }).openBrace,
    )!
    const r = erParser.resolveRewrites(doc, {
      type: 'add-relation',
      afterElementId: car.id,
      from: 'CAR',
      to: 'DRIVER',
      cardLeft: '||',
      line: '--',
      cardRight: '|{',
    })
    const out = reassemble(doc, r!)
    expect(out.indexOf('||--|{')).toBeGreaterThan(out.indexOf('}'))
  })
})

describe('er 词法助手', () => {
  it('基数符号 ↔ 语义值全表互逆', () => {
    for (const card of ['zero-one', 'one', 'zero-many', 'one-many'] as const) {
      expect(erCardinalityOf(ER_CARD_LEFT_OF[card], 'left')).toBe(card)
      expect(erCardinalityOf(ER_CARD_RIGHT_OF[card], 'right')).toBe(card)
    }
    expect(erCardinalityOf('xx', 'left')).toBeNull()
  })

  it('实体名校验拒绝空白与结构字符', () => {
    expect(isValidErName('CAR')).toBe(true)
    expect(isValidErName('名前')).toBe(true)
    expect(isValidErName('')).toBe(false)
    expect(isValidErName('A B')).toBe(false)
    expect(isValidErName('A{')).toBe(false)
  })
})
