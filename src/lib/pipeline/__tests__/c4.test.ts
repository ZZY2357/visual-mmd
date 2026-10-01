import { describe, expect, it } from 'vitest'
import {
  C4_BOUNDARY_MACROS,
  C4_ELEMENT_MACROS,
  C4_KEYWORDS,
  C4_REL_MACRO_OF,
  C4_REL_MACROS,
  isValidC4Alias,
  isValidC4Text,
  quoteC4Value,
  renderC4Boundary,
  renderC4Element,
  renderC4Relation,
  splitC4Args,
  stripC4Quote,
  c4Parser,
  type C4BoundaryData,
  type C4ElementData,
  type C4Intent,
  type C4RelationData,
} from '../c4'
import { reassemble, type SourceDocument } from '../document'

/**
 * C4 解析器测试（more-diagrams 工单 18，语法事实以
 * .scratch/more-diagrams/research/data-display.md §9 为准；探针已用 mermaid 实测复核）：
 * 解析（verbatim identity）、白名单制（表外宏逐字保留）、意图往返、逐字保留、非法边界。
 */

function parse(source: string): SourceDocument {
  const result = c4Parser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

/** 解析 → 应用意图 → 重组装 → 再解析（形状不变式由二次解析断言） */
function apply(doc: SourceDocument, intent: C4Intent): SourceDocument {
  const rewrites = c4Parser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return parse(reassemble(doc, rewrites))
}

const SAMPLE = `C4Context
    title 网上银行系统
    Person(customer, "个人客户", "使用网银的客户")
    System(banking, "网银系统", "核心业务系统")
    System_Ext(email, "邮件系统", "外部邮件网关")
    Enterprise_Boundary(b0, "银行边界") {
        SystemDb(db, "客户数据库", "Oracle")
    }
    Rel(customer, banking, "访问", "HTTPS")
    Rel(banking, email, "发送通知", "SMTP", $descr="通过邮件网关")
`

/** 按元素 id 取声明数据（测试助手） */
function elementsOf(doc: SourceDocument): C4ElementData[] {
  return doc.elements.filter((p) => p.element.kind === 'c4-element').map((p) => p.element as C4ElementData)
}

function boundariesOf(doc: SourceDocument): C4BoundaryData[] {
  return doc.elements.filter((p) => p.element.kind === 'c4-boundary').map((p) => p.element as C4BoundaryData)
}

function relationsOf(doc: SourceDocument): C4RelationData[] {
  return doc.elements.filter((p) => p.element.kind === 'c4-relation').map((p) => p.element as C4RelationData)
}

describe('C4 解析（more-diagrams 工单 18）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('声明头：五个关键字都可作首行；`title` 行不入元素（白名单外逐字保留）', () => {
    for (const keyword of C4_KEYWORDS) {
      const doc = parse(`${keyword}\n`)
      expect(doc.elements[0]?.id).toBe('c4-header')
      expect(doc.elements[0]?.element.kind).toBe('c4-header')
      expect((doc.elements[0]?.element as unknown as { keyword: string }).keyword).toBe(keyword)
    }
    expect(parse(SAMPLE).elements.map((p) => p.element.kind)).not.toContain('c4-title')
  })

  it('缺声明头 / 小写关键字：解析失败并报首行', () => {
    const bare = c4Parser.parse('Person(a, "A")\n')
    if (bare.ok) throw new Error('缺声明头必须解析失败')
    expect(bare.error.line).toBe(1)
    expect(c4Parser.parse('c4context\n').ok).toBe(false)
    expect(c4Parser.parse('C4context\n').ok).toBe(false)
  })

  it('Person 家族：基础与 `_Ext`，位置表 alias,label,descr,…；element id = `c4-element:<alias>`', () => {
    const doc = parse('C4Context\n    Person(a, "A")\n    Person_Ext(b, "B", "外部方")\n')
    const els = elementsOf(doc)
    expect(doc.elements.map((p) => p.id)).toEqual(['c4-header', 'c4-element:a', 'c4-element:b'])
    expect(els[0]).toMatchObject({
      macro: 'Person',
      elementKind: 'person',
      variant: '',
      fields: { alias: 'a', label: 'A', techn: null, descr: null },
    })
    expect(els[1]).toMatchObject({ macro: 'Person_Ext', variant: '_Ext', fields: { alias: 'b', descr: '外部方' } })
  })

  it('System 家族：Db / Queue 形状变体与 `_Ext` 可组合，位置表无 techn 位', () => {
    const doc = parse(
      'C4Context\n    System(s, "S")\n    System_Ext(e, "E")\n    SystemDb(db, "DB")\n    SystemQueue(q, "Q")\n' +
        '    SystemDb_Ext(eb, "EDB")\n    SystemQueue_Ext(eq, "EQ")\n',
    )
    const els = elementsOf(doc)
    expect(els.map((e) => e.macro)).toEqual([
      'System',
      'System_Ext',
      'SystemDb',
      'SystemQueue',
      'SystemDb_Ext',
      'SystemQueue_Ext',
    ])
    expect(els.map((e) => e.elementKind)).toEqual(['system', 'system', 'system', 'system', 'system', 'system'])
    expect(els.map((e) => e.variant)).toEqual(['', '_Ext', 'Db', 'Queue', 'Db_Ext', 'Queue_Ext'])
    // System 家族第 3 位是 descr，不是 techn（mermaid 声明签名实测）
    const withThree = elementsOf(parse('C4Context\n    System(s, "S", "描述", "sprite")\n'))[0]
    expect(withThree?.fields).toMatchObject({ descr: '描述', sprite: 'sprite', techn: null })
  })

  it('Container / Component 家族：位置表 alias,label,techn,descr,…（第 3 位是 techn）', () => {
    const doc = parse(
      'C4Container\n    Container(api, "API", "Go")\n    Container_Ext(x, "X")\n' +
        '    ContainerDb(cdb, "DB", "PostgreSQL")\n    ContainerQueue(cq, "Queue")\n' +
        '    Component(c, "C", "React")\n    ComponentDb(cd, "CD")\n',
    )
    const els = elementsOf(doc)
    expect(els.map((e) => e.elementKind)).toEqual(['container', 'container', 'container', 'container', 'component', 'component'])
    expect(els[0]?.fields).toMatchObject({ alias: 'api', label: 'API', techn: 'Go' })
    expect(els[2]?.fields).toMatchObject({ techn: 'PostgreSQL' })
    expect(els[4]?.fields).toMatchObject({ techn: 'React' })
    // Container 家族全 18 个宏都进白名单
    expect(Object.keys(C4_ELEMENT_MACROS)).toHaveLength(20)
  })

  it('边界块体：四类 Boundary 各有 boundaryKind；元素挂 parentAlias；`}` 行不入元素', () => {
    const doc = parse(
      'C4Context\n' +
        '    Enterprise_Boundary(e, "企业") {\n        System(a, "A")\n    }\n' +
        '    System_Boundary(s, "系统") {\n        System(b, "B")\n    }\n' +
        '    Boundary(g, "通用") {\n        System(c, "C")\n    }\n' +
        '    Container_Boundary(cb, "容器") {\n        Container(d, "D")\n    }\n',
    )
    const bs = boundariesOf(doc)
    expect(bs.map((b) => b.macro)).toEqual([
      'Enterprise_Boundary',
      'System_Boundary',
      'Boundary',
      'Container_Boundary',
    ])
    expect(bs.map((b) => b.boundaryKind)).toEqual(['enterprise', 'system', 'generic', 'container'])
    expect(elementsOf(doc).map((e) => e.parentAlias)).toEqual(['e', 's', 'g', 'cb'])
    // `}` 收尾行不入元素
    expect(doc.elements.map((p) => p.element.kind)).not.toContain('c4-boundary-end')
  })

  it('Deployment Node 四类：与边界同走块体构造（research §9 实测 addDeploymentNode → boundaries）', () => {
    const doc = parse(
      'C4Deployment\n' +
        '    Deployment_Node(dn, "数据中心", "机房", "tags") {\n        Node(n, "节点") {\n' +
        '            Node_L(l, "左") {\n                Node_R(r, "右") {\n                    System(s, "S")\n' +
        '                }\n            }\n        }\n    }\n',
    )
    const bs = boundariesOf(doc)
    expect(bs.map((b) => b.boundaryKind)).toEqual(['deployment', 'deployment', 'deployment', 'deployment'])
    expect(bs.map((b) => b.fields.alias)).toEqual(['dn', 'n', 'l', 'r'])
    // 第 3 位 type 落在 techn 位；第 4 位 tags
    expect(bs[0]?.fields).toMatchObject({ label: '数据中心', techn: '机房', tags: 'tags' })
    // 嵌套：parentAlias 是块栈顶
    expect(bs.map((b) => b.parentAlias)).toEqual([null, 'dn', 'n', 'l'])
    expect(elementsOf(doc)[0]?.parentAlias).toBe('r')
  })

  it('无 `{` 的边界宏调用不算边界（回落为白名单外行逐字保留）', () => {
    const src = 'C4Context\n    Enterprise_Boundary(b0, "边界")\n    System(a, "A")\n'
    const doc = parse(src)
    expect(boundariesOf(doc)).toHaveLength(0)
    expect(elementsOf(doc)).toHaveLength(1)
    expect(reassemble(doc)).toBe(src)
  })

  it('关系家族：Rel / BiRel / Rel_Back / 方向别名 / RelIndex，宏与方向逐字保留', () => {
    const src =
      'C4Context\n    System(a, "A")\n    System(b, "B")\n' +
      '    Rel(a, b, "L")\n    BiRel(a, b, "B")\n    Rel_Back(a, b, "R")\n' +
      '    Rel_U(a, b, "U")\n    Rel_Up(a, b, "Up")\n    Rel_D(a, b, "D")\n    Rel_Down(a, b, "Down")\n' +
      '    Rel_L(a, b, "L2")\n    Rel_Left(a, b, "Left")\n    Rel_R(a, b, "R2")\n    Rel_Right(a, b, "Right")\n' +
      '    RelIndex(1, a, b, "I")\n'
    const rels = relationsOf(parse(src))
    expect(rels.map((r) => r.macro)).toEqual([
      'Rel',
      'BiRel',
      'Rel_Back',
      'Rel_U',
      'Rel_Up',
      'Rel_D',
      'Rel_Down',
      'Rel_L',
      'Rel_Left',
      'Rel_R',
      'Rel_Right',
      'RelIndex',
    ])
    expect(rels.map((r) => r.direction)).toEqual([
      'default',
      'default',
      'default',
      'U',
      'U',
      'D',
      'D',
      'L',
      'L',
      'R',
      'R',
      'default',
    ])
    expect(rels[1]?.bidirectional).toBe(true)
    expect(rels[2]?.reversed).toBe(true)
    expect(rels[11]?.indexed).toBe(true)
    expect(rels[11]?.indexRaw).toBe('1')
  })

  it('关系位置序身份 `relation:N`（1 基文档序），RelIndex 的 index 前置位被剥离', () => {
    const doc = parse(SAMPLE)
    const rels = relationsOf(doc)
    expect(doc.elements.filter((p) => p.element.kind === 'c4-relation').map((p) => p.id)).toEqual([
      'relation:1',
      'relation:2',
    ])
    expect(rels[0]).toMatchObject({ from: 'customer', to: 'banking', label: '访问', techn: 'HTTPS' })
    // RelIndex(a, b, ...) 的 index 位不参与 from/to 取值
    const idx = relationsOf(parse('C4Context\n    System(a, "A")\n    System(b, "B")\n    RelIndex(7, a, b, "L")\n'))[0]
    expect(idx).toMatchObject({ from: 'a', to: 'b', label: 'L', indexRaw: '7' })
  })

  it('命名参数形态：`$from` / `$to` / `$label` / `$techn` / `$descr` / `$link` 按名覆盖位置实参', () => {
    const doc = parse(
      'C4Context\n    System(a, "A")\n    System(b, "B")\n' +
        '    Rel($from=a, $to=b, $label="命名", $techn="gRPC", $descr="说明", $link="https://x")\n',
    )
    const rel = relationsOf(doc)[0]
    expect(rel).toMatchObject({ from: 'a', to: 'b', label: '命名', techn: 'gRPC', descr: '说明', link: 'https://x' })
    expect(rel?.args.map((a) => a.name)).toEqual(['from', 'to', 'label', 'techn', 'descr', 'link'])
  })

  it('元素命名参数形态：`$descr=` / `$link=` 覆盖语义位（SAMPLE 的 Rel 用法同源）', () => {
    const el = elementsOf(
      parse('C4Context\n    Person(a, "A", $descr="命名描述", $link="https://x")\n'),
    )[0]
    expect(el?.fields).toMatchObject({ alias: 'a', label: 'A', descr: '命名描述', link: 'https://x' })
  })

  it('值去引号：带引号串剥引号、内部原文保留；裸词原样', () => {
    const el = elementsOf(parse('C4Context\n    System(a, "带,逗号", "含 \\"内\\" 引号")\n'))[0]
    expect(el?.fields.label).toBe('带,逗号')
    const bare = elementsOf(parse('C4Context\n    Container(api, API, Go)\n'))[0]
    expect(bare?.fields).toMatchObject({ label: 'API', techn: 'Go' })
  })

  it('逐字保留：白名单外宏 / Lay_* / Show / Hide / Update* / SHOW_LEGEND / title / accTitle / `%%` / 空行不进元素', () => {
    const src = `C4Context
    %% 一行注释
    title 标题
    accTitle: 无障碍标题
    Person(a, "A")

    Rel_S(a, b, "S")
    Lay_U(a, b)
    Show(a, "L")
    Hide(a)
    UpdateElementStyle(a, $bgColor="red")
    UpdateRelStyle(a, b, $textColor="blue")
    UpdateLayoutConfig($c4ShapeInRow="3")
    SHOW_LEGEND()
    Person(b, "B")
`
    const doc = parse(src)
    expect(reassemble(doc)).toBe(src)
    expect(elementsOf(doc).map((e) => e.fields.alias)).toEqual(['a', 'b'])
    expect(doc.elements.map((p) => p.element.kind)).toEqual(['c4-header', 'c4-element', 'c4-element'])
  })

  it('frontmatter 整块跳过、逐字保留', () => {
    const src = '---\ntitle: x\n---\nC4Context\n    Person(a, "A")\n'
    const doc = parse(src)
    expect(reassemble(doc)).toBe(src)
    expect(doc.elements[0]?.element.kind).toBe('c4-header')
  })

  it('无法识别的行不报错（ADR-0008）：`Unknown(arg)` 与裸词一律逐字保留', () => {
    const src = 'C4Context\n    Person(a, "A")\n    UnknownThing(1, 2)\n    这不是一行\n'
    expect(reassemble(parse(src))).toBe(src)
  })

  it('同一 alias 重复声明按出现序编号（`c4-element:<alias>#2`）', () => {
    const doc = parse('C4Context\n    System(a, "A")\n    System(a, "A2")\n')
    const ids = doc.elements.filter((p) => p.element.kind === 'c4-element').map((p) => p.id)
    expect(ids).toEqual(['c4-element:a', 'c4-element:a#2'])
  })

  it('空图退化形态：只有声明头', () => {
    const doc = parse('C4Context\n')
    expect(doc.elements).toHaveLength(1)
    expect(elementsOf(doc)).toEqual([])
    expect(boundariesOf(doc)).toEqual([])
    expect(relationsOf(doc)).toEqual([])
  })
})

describe('C4 意图往返（more-diagrams 工单 18）', () => {
  it('add-c4-element：按宏的位置表落位，缺 label 时只写 alias', () => {
    let doc = apply(parse(SAMPLE), { type: 'add-c4-element', macro: 'System', alias: 'sms', label: '短信系统' })
    expect(doc.source).toContain('System(sms, "短信系统")')
    doc = apply(doc, { type: 'add-c4-element', macro: 'Person', alias: 'ops' })
    expect(doc.source).toContain('Person(ops)')
  })

  it('add-c4-element：Container 宏带 techn 位（label 与 techn 都写）', () => {
    const doc = apply(parse(SAMPLE), {
      type: 'add-c4-element',
      macro: 'Container',
      alias: 'web',
      label: 'Web 前端',
      techn: 'React',
    })
    expect(doc.source).toContain('Container(web, "Web 前端", "React")')
  })

  it('add-c4-element：非法 alias / 非法文本被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-element', macro: 'System', alias: '1bad' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-element', macro: 'System', alias: 'a b' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-element', macro: 'System', alias: 'ok', label: '  ' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-element', macro: 'System', alias: 'ok', label: 'a"b' })).toBeNull()
    // 白名单外宏（Rel_S / Lay_*）不能当元素宏
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-element', macro: 'Rel_S', alias: 'ok' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-element', macro: 'Nope', alias: 'ok' })).toBeNull()
  })

  it('set-c4-element：改 label / descr 就地替换，其余逐字保留', () => {
    const doc = apply(parse(SAMPLE), {
      type: 'set-c4-element',
      elementId: 'c4-element:customer',
      changes: { label: '企业客户' },
    })
    expect(doc.source).toContain('Person(customer, "企业客户", "使用网银的客户")')
    expect(doc.source).toContain('Enterprise_Boundary(b0, "银行边界") {')
  })

  it('set-c4-element：label 为 null = 清空该位；补位编辑得到合法源码', () => {
    const doc = apply(parse(SAMPLE), {
      type: 'set-c4-element',
      elementId: 'c4-element:customer',
      changes: { label: null },
    })
    expect(doc.source).toContain('Person(customer, , "使用网银的客户")')
    // 给只有 alias 的元素补 descr：中间缺口补空串
    const grown = apply(parse('C4Context\n    Person(a, "A")\n'), {
      type: 'set-c4-element',
      elementId: 'c4-element:a',
      changes: { descr: '新描述' },
    })
    expect(grown.source).toContain('Person(a, "A", "新描述")')
  })

  it('set-c4-element：非法文本被拒绝；不存在 / 别种选中被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(
      c4Parser.resolveRewrites(doc, {
        type: 'set-c4-element',
        elementId: 'c4-element:customer',
        changes: { label: 'a"b' },
      }),
    ).toBeNull()
    expect(
      c4Parser.resolveRewrites(doc, { type: 'set-c4-element', elementId: 'c4-element:ghost', changes: { label: 'x' } }),
    ).toBeNull()
    expect(
      c4Parser.resolveRewrites(doc, { type: 'set-c4-element', elementId: 'relation:1', changes: { label: 'x' } }),
    ).toBeNull()
  })

  it('rename-c4-alias：连带重写引用它的关系端点（from / to），label 等逐字保留', () => {
    const doc = apply(parse(SAMPLE), { type: 'rename-c4-alias', elementId: 'c4-element:banking', alias: 'coreBanking' })
    expect(doc.source).toContain('System(coreBanking, "网银系统", "核心业务系统")')
    expect(doc.source).toContain('Rel(customer, coreBanking, "访问", "HTTPS")')
    expect(doc.source).toContain('Rel(coreBanking, email, "发送通知", "SMTP", $descr="通过邮件网关")')
  })

  it('rename-c4-alias：非法 / 重名 / 空改动被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(c4Parser.resolveRewrites(doc, { type: 'rename-c4-alias', elementId: 'c4-element:banking', alias: '1bad' })).toBeNull()
    // 已被别的元素占用（email）
    expect(c4Parser.resolveRewrites(doc, { type: 'rename-c4-alias', elementId: 'c4-element:banking', alias: 'email' })).toBeNull()
    // 已被边界占用（b0）
    expect(c4Parser.resolveRewrites(doc, { type: 'rename-c4-alias', elementId: 'c4-element:banking', alias: 'b0' })).toBeNull()
    // 同名不改
    expect(c4Parser.resolveRewrites(doc, { type: 'rename-c4-alias', elementId: 'c4-element:banking', alias: 'banking' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'rename-c4-alias', elementId: 'c4-element:ghost', alias: 'x' })).toBeNull()
  })

  it('delete-c4-element：删元素连带删去引用它的关系（含作为 from 与 to 两侧）', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-c4-element', elementId: 'c4-element:banking' })
    expect(doc.source).not.toContain('System(banking')
    expect(doc.source).not.toContain('Rel(customer, banking')
    expect(doc.source).not.toContain('Rel(banking, email')
    // 不引用 banking 的声明保留
    expect(doc.source).toContain('Person(customer')
    expect(doc.source).toContain('System_Ext(email')
    expect(doc.source).toContain('SystemDb(db')
  })

  it('delete-c4-element：边界内的元素可删，边界块体逐字保留（空块仍合法）', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-c4-element', elementId: 'c4-element:db' })
    expect(doc.source).not.toContain('SystemDb(db')
    expect(doc.source).toContain('Enterprise_Boundary(b0, "银行边界") {')
  })

  it('add-c4-boundary：落空块两行（开行 + `}`），可指定锚点', () => {
    const doc = apply(parse(SAMPLE), { type: 'add-c4-boundary', macro: 'System_Boundary', alias: 'b1', label: '新边界' })
    expect(doc.source).toContain('System_Boundary(b1, "新边界") {')
    expect(doc.source.trimEnd().endsWith('}')).toBe(true)
    // 锚在指定元素之后
    const anchored = apply(parse(SAMPLE), {
      type: 'add-c4-boundary',
      macro: 'Boundary',
      alias: 'b2',
      afterElementId: 'c4-element:customer',
    })
    expect(anchored.source).toContain('Boundary(b2) {')
  })

  it('add-c4-boundary：非法 macro / alias / label 被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-boundary', macro: 'Nope', alias: 'b1' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-boundary', macro: 'Boundary', alias: '1bad' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-c4-boundary', macro: 'Boundary', alias: 'b1', label: 'a"b' })).toBeNull()
  })

  it('set-c4-boundary：改 label 保持 ` {` 尾段与块体逐字保留', () => {
    const doc = apply(parse(SAMPLE), {
      type: 'set-c4-boundary',
      elementId: 'c4-boundary:b0',
      changes: { label: '内网边界' },
    })
    expect(doc.source).toContain('Enterprise_Boundary(b0, "内网边界") {')
    expect(doc.source).toContain('SystemDb(db, "客户数据库", "Oracle")')
  })

  it('set-c4-boundary：label 为 null 清空该位；非法文本被拒绝', () => {
    const doc = apply(parse(SAMPLE), { type: 'set-c4-boundary', elementId: 'c4-boundary:b0', changes: { label: null } })
    expect(doc.source).toContain('Enterprise_Boundary(b0) {')
    expect(
      c4Parser.resolveRewrites(parse(SAMPLE), {
        type: 'set-c4-boundary',
        elementId: 'c4-boundary:b0',
        changes: { label: 'a"b' },
      }),
    ).toBeNull()
    expect(
      c4Parser.resolveRewrites(parse(SAMPLE), { type: 'set-c4-boundary', elementId: 'c4-boundary:ghost', changes: { label: 'x' } }),
    ).toBeNull()
  })

  it('delete-c4-boundary：只删开行，块体与 `}` 逐字保留', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-c4-boundary', elementId: 'c4-boundary:b0' })
    expect(doc.source).not.toContain('Enterprise_Boundary')
    expect(doc.source).toContain('SystemDb(db, "客户数据库", "Oracle")')
    expect(doc.source).toContain('\n    }')
  })

  it('add-rel：`Rel(from, to, "label", "techn")`；缺 label 时不写标签位', () => {
    let doc = apply(parse(SAMPLE), { type: 'add-rel', from: 'customer', to: 'db', label: '查询', techn: 'SQL' })
    expect(doc.source).toContain('Rel(customer, db, "查询", "SQL")')
    doc = apply(doc, { type: 'add-rel', from: 'customer', to: 'email' })
    expect(doc.source).toContain('Rel(customer, email)')
  })

  it('add-rel：direction 决定宏名（Rel / Rel_U / Rel_D / Rel_L / Rel_R）', () => {
    const doc = apply(parse(SAMPLE), { type: 'add-rel', from: 'customer', to: 'db', label: '向下', direction: 'D' })
    expect(doc.source).toContain('Rel_D(customer, db, "向下")')
  })

  it('add-rel：非法 from / to / 文本被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(c4Parser.resolveRewrites(doc, { type: 'add-rel', from: '1bad', to: 'banking' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-rel', from: 'customer', to: 'a b' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-rel', from: 'customer', to: 'banking', label: '  ' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'add-rel', from: 'customer', to: 'banking', techn: 'a"b' })).toBeNull()
  })

  it('set-rel：改 label / techn / descr 就地替换', () => {
    const doc = apply(parse(SAMPLE), { type: 'set-rel', elementId: 'relation:1', changes: { label: '登录' } })
    expect(doc.source).toContain('Rel(customer, banking, "登录", "HTTPS")')
  })

  it('set-rel：label 为 null 清空该位；RelIndex 的前置 index 逐字保留', () => {
    const doc = apply(parse(SAMPLE), { type: 'set-rel', elementId: 'relation:1', changes: { label: null } })
    expect(doc.source).toContain('Rel(customer, banking, , "HTTPS")')
    const idx = apply(parse('C4Context\n    System(a, "A")\n    System(b, "B")\n    RelIndex(3, a, b, "L")\n'), {
      type: 'set-rel',
      elementId: 'relation:1',
      changes: { label: '新' },
    })
    expect(idx.source).toContain('RelIndex(3, a, b, "新")')
  })

  it('set-rel：direction 改宏名（Rel → Rel_U，反向亦然）', () => {
    let doc = apply(parse(SAMPLE), { type: 'set-rel', elementId: 'relation:1', changes: { direction: 'U' } })
    expect(doc.source).toContain('Rel_U(customer, banking, "访问", "HTTPS")')
    doc = apply(parse('C4Context\n    System(a, "A")\n    System(b, "B")\n    Rel_L(a, b, "L")\n'), {
      type: 'set-rel',
      elementId: 'relation:1',
      changes: { direction: 'default' },
    })
    expect(doc.source).toContain('Rel(a, b, "L")')
  })

  it('set-rel / delete-rel：不存在 / 别种选中 / 非法文本被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(c4Parser.resolveRewrites(doc, { type: 'set-rel', elementId: 'relation:99', changes: { label: 'x' } })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'set-rel', elementId: 'c4-element:banking', changes: { label: 'x' } })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'set-rel', elementId: 'relation:1', changes: { label: 'a"b' } })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'delete-rel', elementId: 'relation:99' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'delete-rel', elementId: 'c4-element:banking' })).toBeNull()
  })

  it('delete-rel：只删该关系行', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-rel', elementId: 'relation:1' })
    expect(doc.source).not.toContain('Rel(customer, banking')
    expect(doc.source).toContain('Rel(banking, email')
  })

  it('删除后其余元素 id 重新编号（位置序身份随文档序）', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-rel', elementId: 'relation:1' })
    const rels = doc.elements.filter((p) => p.element.kind === 'c4-relation')
    expect(rels.map((p) => p.id)).toEqual(['relation:1'])
    expect((rels[0]?.element as C4RelationData).from).toBe('banking')
  })

  it('不适用意图 / 未知 type 返回 null', () => {
    const doc = parse(SAMPLE)
    expect(c4Parser.resolveRewrites(doc, { type: 'nope' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'delete-c4-element', elementId: 'c4-element:ghost' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'delete-c4-element', elementId: 'relation:1' })).toBeNull()
    expect(c4Parser.resolveRewrites(doc, { type: 'delete-c4-boundary', elementId: 'c4-boundary:ghost' })).toBeNull()
  })
})

describe('C4 词法 / 渲染助手（表单侧）', () => {
  it('isValidC4Alias：标识符词法（首字符字母或 `_`）', () => {
    expect(isValidC4Alias('customer')).toBe(true)
    expect(isValidC4Alias('_a-1')).toBe(true)
    expect(isValidC4Alias('coreBanking')).toBe(true)
    expect(isValidC4Alias('1a')).toBe(false)
    expect(isValidC4Alias('a b')).toBe(false)
    expect(isValidC4Alias('')).toBe(false)
  })

  it('isValidC4Text：非空、无换行、无半角双引号', () => {
    expect(isValidC4Text('个人客户')).toBe(true)
    expect(isValidC4Text('   ')).toBe(false)
    expect(isValidC4Text('a"b')).toBe(false)
    expect(isValidC4Text('a\nb')).toBe(false)
    expect(isValidC4Text("a'b")).toBe(true)
  })

  it('stripC4Quote：成对双引号剥引号，其余原样', () => {
    expect(stripC4Quote('"hello"')).toBe('hello')
    expect(stripC4Quote('bare')).toBe('bare')
    expect(stripC4Quote('"a')).toBe('"a')
    expect(stripC4Quote('"')).toBe('"')
  })

  it('quoteC4Value：仅放行最低限度裸词（小写字母 / 数字 / `_` / `.` / `-` / `/`）', () => {
    expect(quoteC4Value('go')).toBe('go')
    expect(quoteC4Value('api-v2')).toBe('api-v2')
    expect(quoteC4Value('a/b')).toBe('a/b')
    // 大写 / 空格 / 中文 / 大写的技术名一律加引号（裸词会被当标识符或关键字误读）
    expect(quoteC4Value('Go')).toBe('"Go"')
    expect(quoteC4Value('Java 17')).toBe('"Java 17"')
    expect(quoteC4Value('网上银行')).toBe('"网上银行"')
  })

  it('splitC4Args：按顶层逗号切分，跳过引号内逗号与嵌套括号', () => {
    expect(splitC4Args('a, "b, c", d')).toEqual(['a', '"b, c"', 'd'])
    expect(splitC4Args('a, Foo(x, y), b')).toEqual(['a', 'Foo(x, y)', 'b'])
    expect(splitC4Args('$label="x, y", b')).toEqual(['$label="x, y"', 'b'])
    expect(splitC4Args('solo')).toEqual(['solo'])
    expect(splitC4Args('')).toEqual([])
    // 尾随空位被保留（`X(a, , b)` → 中位空串）
    expect(splitC4Args('a, , b')).toEqual(['a', '', 'b'])
  })

  it('renderC4Element：alias 位不加引号，文本位按需加引号；tail 逐字保留', () => {
    const el = elementsOf(parse('C4Context\n    System(banking, "网银", "核心")\n'))[0]!
    expect(renderC4Element(el, { label: 'NewLabel' })).toBe('System(banking, "NewLabel", "核心")')
    // alias 改动走渲染器时也是裸词（真正的 alias 改名走 rename 意图）
    expect(renderC4Element(el, { alias: 'coreBanking' })).toBe('System(coreBanking, "网银", "核心")')
    // `%%` 尾注前的空白被解析器吸进 span 交接处、注释本身留在 tail —— 逐字保留原文
    const withTail = elementsOf(parse('C4Context\n    System(a, "A")  %% 尾注\n'))[0]!
    expect(renderC4Element(withTail, { label: 'B' })).toBe('System(a, "B")%% 尾注  ')
  })

  it('renderC4Element：补位编辑填中间缺口；目标位超出已有实参时追加', () => {
    const el = elementsOf(parse('C4Context\n    Person(a, "A")\n'))[0]!
    expect(renderC4Element(el, { descr: '描述' })).toBe('Person(a, "A", "描述")')
  })

  it('renderC4Boundary：` {` 尾段逐字保留', () => {
    const bd = boundariesOf(parse(SAMPLE))[0]!
    expect(renderC4Boundary(bd, { label: '内网' })).toBe('Enterprise_Boundary(b0, "内网") {')
  })

  it('renderC4Relation：direction 改宏名；from / to 手术改写不加引号', () => {
    const rel = relationsOf(parse(SAMPLE))[0]!
    expect(renderC4Relation(rel, { label: '登录' })).toBe('Rel(customer, banking, "登录", "HTTPS")')
    expect(renderC4Relation(rel, { direction: 'R' })).toBe('Rel_R(customer, banking, "访问", "HTTPS")')
    expect(renderC4Relation(rel, { from: 'client' })).toBe('Rel(client, banking, "访问", "HTTPS")')
    expect(renderC4Relation(rel, { to: 'core' })).toBe('Rel(customer, core, "访问", "HTTPS")')
  })

  it('宏表自洽：关系方向 → 规范宏名；边界表覆盖四类 Boundary + 四类 Node', () => {
    expect(Object.keys(C4_REL_MACRO_OF)).toEqual(['default', 'U', 'D', 'L', 'R'])
    expect(C4_REL_MACRO_OF.U).toBe('Rel_U')
    expect(Object.keys(C4_REL_MACROS)).toHaveLength(12)
    expect(Object.keys(C4_BOUNDARY_MACROS)).toHaveLength(8)
    expect(C4_BOUNDARY_MACROS.Node_L?.boundaryKind).toBe('deployment')
    expect(C4_BOUNDARY_MACROS.Enterprise_Boundary?.boundaryKind).toBe('enterprise')
  })
})
