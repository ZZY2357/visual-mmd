import { describe, expect, it } from 'vitest'
import {
  deriveUsecaseId,
  isValidUsecaseId,
  isValidUsecaseLabel,
  usecaseParser,
  type UsecaseNodeData,
  type UsecaseRelationData,
} from '../usecase'
import { reassemble, type SourceDocument } from '../document'

/**
 * usecase 解析器测试（more-diagrams 工单 26，语法事实以
 * .scratch/more-diagrams/research/usecase.md 为准——工单 26 已实测复核）：
 * 解析（verbatim identity）、意图往返、逐字保留、非法源码 / 非法编辑边界。
 */

function parse(source: string): SourceDocument {
  const result = usecaseParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

const SAMPLE = `usecase-beta
    actor Customer
    actor Admin("Administrator")
    systemBoundary shop["Online Shop"] {
        Login("Sign in")
        Report[Generate report]
    }
    note for Login "Requires session"
    Customer --> Login
    Customer ..> : include Payment
`

/** 解析 → 应用意图 → 重组装 → 再解析（形状不变式由二次解析断言） */
function apply(doc: SourceDocument, intent: Parameters<typeof usecaseParser.resolveRewrites>[1]): SourceDocument {
  const rewrites = usecaseParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return parse(reassemble(doc, rewrites))
}

describe('usecase 解析（more-diagrams 工单 26）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('声明头：只有 usecase-beta（探测器 /^\\s*usecase-beta(?:\s|$)/；裸 usecase 不认）', () => {
    expect(parse('usecase-beta\n').elements[0]?.element.kind).toBe('usecase-header')
    expect(usecaseParser.parse('usecase\n    actor A\n').ok).toBe(false)
    expect(usecaseParser.parse('USE-CASE\n').ok).toBe(false)
  })

  it('声明头可同行带 direction（TB|TD|BT|LR|RL）', () => {
    const doc = parse('usecase-beta LR\n    actor A\n')
    expect(doc.elements[0]?.element.kind).toBe('usecase-header')
  })

  it('缺表头：解析失败并报首行', () => {
    const result = usecaseParser.parse('actor A\n')
    if (result.ok) throw new Error('缺表头必须解析失败')
    expect(result.error.line).toBe(1)
  })

  it('actor 声明：id 即标签 / 圆括号别名，element id = `actor:<id>`', () => {
    const doc = parse('usecase-beta\n    actor User\n    actor Admin("Main administrator")\n')
    const nodes = doc.elements.filter((p) => p.element.kind === 'usecase-actor')
    expect(nodes.map((p) => p.id)).toEqual(['actor:User', 'actor:Admin'])
    expect(nodes[1]?.element).toMatchObject({ labelRaw: '("Main administrator")' })
  })

  it('用例声明：裸 / 圆括号椭圆 / 方括号矩形；引号声明推导确定性 id', () => {
    const doc = parse('usecase-beta\n    Login\n    Signup("注册")\n    Report[Generate report]\n')
    const cases = doc.elements.filter((p) => p.element.kind === 'usecase-usecase')
    expect(cases.map((p) => p.id)).toEqual(['usecase:Login', 'usecase:Signup', 'usecase:Report'])
    expect((cases[0]?.element as UsecaseNodeData).shape).toBe('ellipse')
    expect((cases[1]?.element as UsecaseNodeData).shape).toBe('ellipse')
    expect((cases[2]?.element as UsecaseNodeData).shape).toBe('rect')
  })

  it('derived id：首引号声明无 id 时把非单词字符换 _（与渲染器同口径）', () => {
    expect(deriveUsecaseId('Reset password')).toBe('Reset_password')
    // 无前导标识符的引号声明：id 由标签推导（mermaid 实测 DB：id `Reset_password`）
    const doc = parse('usecase-beta\n    "Reset password"\n')
    const cases = doc.elements.filter((p) => p.element.kind === 'usecase-usecase')
    expect(cases[0]?.id).toBe('usecase:Reset_password')
    expect((cases[0]?.element as UsecaseNodeData).labelRaw).toBe('"Reset password"')
  })

  it('前导标识符优先于标签：`Login("Sign in")` 的 id 仍是 `Login`（mermaid 实测）', () => {
    const doc = parse('usecase-beta\n    Login("Sign in")\n    Report[Generate report]\n')
    const cases = doc.elements.filter((p) => p.element.kind === 'usecase-usecase')
    expect(cases.map((p) => p.id)).toEqual(['usecase:Login', 'usecase:Report'])
  })

  it('系统边界：开行 + end 各一个元素；边界外层无归属', () => {
    const doc = parse('usecase-beta\n    systemBoundary shop["商城"]\n        Login\n    end\n')
    const ids = doc.elements.map((p) => p.id)
    expect(ids).toContain('boundary:shop')
    expect(ids).toContain('boundary-end:shop')
    expect(ids).toContain('usecase:Login')
  })

  it('关系：位置序身份 relation:N，算子与标签逐字保留', () => {
    const doc = parse(SAMPLE)
    const relations = doc.elements
      .filter((p) => p.element.kind === 'usecase-relation')
      .map((p) => ({ id: p.id, element: p.element as UsecaseRelationData }))
    expect(relations.map((r) => r.id)).toEqual(['relation:1', 'relation:2'])
    expect(relations[0]?.element).toMatchObject({ source: 'Customer', operator: '-->', target: 'Login' })
    expect(relations[1]?.element).toMatchObject({ source: 'Customer', operator: '..>', target: 'Payment' })
  })

  it('语义关系 `: include` / `: extend` 标签在目标之前解析（research §43 实测口径）', () => {
    const doc = parse(
      'usecase-beta\n    Checkout ..> : include Payment\n    Browse ..> : extend Checkout\n',
    )
    const rels = doc.elements
      .filter((p) => p.element.kind === 'usecase-relation')
      .map((p) => p.element as UsecaseRelationData)
    expect(rels[0]).toMatchObject({ source: 'Checkout', operator: '..>', labelRaw: 'include', target: 'Payment' })
    expect(rels[1]).toMatchObject({ source: 'Browse', operator: '..>', labelRaw: 'extend', target: 'Checkout' })
  })

  it('七种实心关联 + 语义关系都能解析', () => {
    const src = `usecase-beta
    actor A
    actor B
    A --> B
    A <-- B
    A -- B
    A --o B
    A o-- B
    A --x B
    A x-- B
    A ..> B
    A --|> B
`
    const doc = parse(src)
    const ops = doc.elements
      .filter((p) => p.element.kind === 'usecase-relation')
      .map((p) => (p.element as UsecaseRelationData).operator)
    expect(ops).toEqual(['-->', '<--', '--', '--o', 'o--', '--x', 'x--', '..>', '--|>'])
  })

  it('note for：解析为注释节点（位置序计数 note:N）', () => {
    const doc = parse('usecase-beta\n    Login\n    note for Login "Requires session"\n')
    const note = doc.elements.find((p) => p.element.kind === 'usecase-note')
    expect(note?.id).toBe('note:1')
  })

  it('文档级属性：direction / accTitle / accDescr', () => {
    const doc = parse('usecase-beta\n    direction LR\n    accTitle: 用例\n    actor A\n')
    const metas = doc.elements.filter((p) => p.element.kind === 'usecase-meta')
    expect(metas.map((p) => p.id)).toEqual(['usecase-meta:direction', 'usecase-meta:accTitle'])
  })

  it('逐字保留：classDef / class / style / 元数据 / `%%` 注释 / 空行不进元素', () => {
    const src = `usecase-beta
    %% 一行注释
    actor A
    classDef big fill:#f00

    class A big
    A:::big
`
    const doc = parse(src)
    expect(reassemble(doc)).toBe(src)
    expect(doc.elements.map((p) => p.element.kind)).toEqual(['usecase-header', 'usecase-actor'])
  })

  it('actor 元数据 `@{…}` 与构造型 `<<…>>` 留在 tail 逐字保留、不破坏解析', () => {
    const src = 'usecase-beta\n    actor A @{ type: hollow } <<Employee>>\n'
    const doc = parse(src)
    const actor = doc.elements.find((p) => p.element.kind === 'usecase-actor')
    expect(actor?.id).toBe('actor:A')
    expect(reassemble(doc)).toBe(src)
  })

  it('frontmatter 整块跳过、逐字保留', () => {
    const src = '---\ntitle: x\n---\nusecase-beta\n    actor A\n'
    const doc = parse(src)
    expect(reassemble(doc)).toBe(src)
    expect(doc.elements[0]?.element.kind).toBe('usecase-header')
  })
})

describe('usecase 意图往返（more-diagrams 工单 26）', () => {
  it('set-usecase-label：改标签保持形状（方括号仍是方括号）', () => {
    const doc = apply(parse(SAMPLE), { type: 'set-usecase-label', elementId: 'usecase:Report', label: '生成报表' })
    expect(doc.source).toContain('Report["生成报表"]')
  })

  it('set-usecase-label：label 为 null = 删除标签段', () => {
    const doc = apply(parse(SAMPLE), { type: 'set-usecase-label', elementId: 'usecase:Login', label: null })
    expect(doc.source).toContain('\n        Login\n')
  })

  it('set-usecase-label：空标签 / 含引号被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(usecaseParser.resolveRewrites(doc, { type: 'set-usecase-label', elementId: 'usecase:Login', label: '   ' })).toBeNull()
    expect(usecaseParser.resolveRewrites(doc, { type: 'set-usecase-label', elementId: 'usecase:Login', label: 'a"b' })).toBeNull()
  })

  it('rename-usecase-id：连带重写引用它的关系端点', () => {
    const doc = apply(parse(SAMPLE), { type: 'rename-usecase-id', elementId: 'usecase:Login', id: 'SignIn' })
    expect(doc.source).toContain('SignIn("Sign in")')
    expect(doc.source).toContain('Customer --> SignIn')
    expect(doc.source).toContain('note for SignIn')
  })

  it('rename-usecase-id：非法 id 被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(usecaseParser.resolveRewrites(doc, { type: 'rename-usecase-id', elementId: 'usecase:Login', id: '1bad' })).toBeNull()
    expect(usecaseParser.resolveRewrites(doc, { type: 'rename-usecase-id', elementId: 'usecase:Login', id: 'a b' })).toBeNull()
  })

  it('add-actor / add-usecase / add-boundary：追加到文档末尾', () => {
    let doc = apply(parse(SAMPLE), { type: 'add-actor', id: 'Guest' })
    expect(doc.source).toContain('actor Guest')
    doc = apply(doc, { type: 'add-usecase', id: 'Browse', label: '浏览', shape: 'rect' })
    expect(doc.source).toContain('Browse["浏览"]')
    doc = apply(doc, { type: 'add-boundary', id: 'pay', label: '支付' })
    expect(doc.source).toContain('systemBoundary pay["支付"]')
    expect(doc.source.trimEnd().endsWith('end')).toBe(true)
  })

  it('add-actor：非法 id / 非法标签被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(usecaseParser.resolveRewrites(doc, { type: 'add-actor', id: '1a' })).toBeNull()
    expect(usecaseParser.resolveRewrites(doc, { type: 'add-actor', id: 'Ok', label: 'a"b' })).toBeNull()
  })

  it('set-usecase-title：无标题时紧随声明头插入 accTitle', () => {
    const doc = apply(parse(SAMPLE), { type: 'set-usecase-title', text: '在线商城' })
    expect(doc.source).toContain('accTitle: 在线商城')
  })

  it('set-relation-label：改标签与删除标签', () => {
    let doc = apply(parse(SAMPLE), { type: 'set-relation-label', elementId: 'relation:1', label: '登录' })
    expect(doc.source).toContain('Customer --> "登录" Login')
    doc = apply(doc, { type: 'set-relation-label', elementId: 'relation:1', label: null })
    expect(doc.source).toContain('Customer --> Login')
  })

  it('delete-usecase-element：删用例连带删引用它的关系与 note', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-usecase-element', elementId: 'usecase:Login' })
    expect(doc.source).not.toContain('Login("Sign in")')
    expect(doc.source).not.toContain('Customer --> Login')
    expect(doc.source).not.toContain('note for Login')
    // 不引用 Login 的关系保留
    expect(doc.source).toContain('include Payment')
  })

  it('delete-usecase-element：删边界连带删 end 行', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-usecase-element', elementId: 'boundary:shop' })
    expect(doc.source).not.toContain('systemBoundary')
    expect(doc.source).not.toContain('    end')
  })

  it('delete-usecase-relation：只删该关系行', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-usecase-relation', elementId: 'relation:1' })
    expect(doc.source).not.toContain('Customer --> Login')
    expect(doc.source).toContain('include Payment')
  })

  it('不适用意图返回 null（未知 type / 不存在的元素）', () => {
    const doc = parse(SAMPLE)
    expect(usecaseParser.resolveRewrites(doc, { type: 'nope' })).toBeNull()
    expect(usecaseParser.resolveRewrites(doc, { type: 'delete-usecase-element', elementId: 'actor:Ghost' })).toBeNull()
    expect(usecaseParser.resolveRewrites(doc, { type: 'delete-usecase-relation', elementId: 'relation:99' })).toBeNull()
  })
})

describe('usecase 词法校验助手（表单侧）', () => {
  it('isValidUsecaseId：裸标识符词法', () => {
    expect(isValidUsecaseId('Login')).toBe(true)
    expect(isValidUsecaseId('_a-1')).toBe(true)
    expect(isValidUsecaseId('1a')).toBe(false)
    expect(isValidUsecaseId('a b')).toBe(false)
  })

  it('isValidUsecaseLabel：非空、无引号换行', () => {
    expect(isValidUsecaseLabel('登录')).toBe(true)
    expect(isValidUsecaseLabel('   ')).toBe(false)
    expect(isValidUsecaseLabel('a"b')).toBe(false)
    expect(isValidUsecaseLabel("a'b")).toBe(false)
  })

  it('deriveUsecaseId：非单词字符换 _', () => {
    expect(deriveUsecaseId('Reset password')).toBe('Reset_password')
    expect(deriveUsecaseId('a-b.c')).toBe('a_b_c')
  })
})
