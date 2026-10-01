import { describe, expect, it } from 'vitest'
import {
  TreeviewParser,
  isValidTreeviewName,
  renderTreeviewNode,
  treeviewParser,
  type TreeviewNodeData,
} from '../treeview'
import { reassemble } from '../document'

/** 解析成功断言（测试内复用） */
function parseOk(src: string) {
  const r = treeviewParser.parse(src)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

function nodeById(src: string, id: string): TreeviewNodeData {
  const doc = parseOk(src)
  const part = doc.elements.find((e) => e.id === id)
  if (part === undefined) throw new Error(`找不到 ${id}`)
  return part.element as TreeviewNodeData
}

const SAMPLE = `treeView-beta
/
    src/
        main.ts
        utils.ts
    docs/
        README.md
`

describe('treeview 解析器：声明与识别（more-diagrams 工单 24 / research §1）', () => {
  it('解析必须以 `treeView-beta` 声明开始（大小写敏感）', () => {
    expect(treeviewParser.parse('treeView-beta\n/\n').ok).toBe(true)
    // Langium 关键字大小写敏感：错误大小写是解析失败
    expect(treeviewParser.parse('TREEVIEW-BETA\n/\n').ok).toBe(false)
    expect(treeviewParser.parse('treeview-beta\n/\n').ok).toBe(false)
  })

  it('无声明（首行即节点）解析失败', () => {
    const r = treeviewParser.parse('    src/\n')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.line).toBeGreaterThan(0)
  })

  it('header 元素被识别，span 含行尾换行', () => {
    const doc = parseOk('treeView-beta\n/\n')
    const header = doc.elements.find((e) => e.id === 'header')
    expect(header).toBeDefined()
    expect(header?.element.kind).toBe('treeview-header')
  })
})

describe('treeview 解析器：节点与层级（research §1/坑 1）', () => {
  it('节点按文档序编号 `treeview-node:N`，level = 缩进字符数', () => {
    // 根 `/`：目录标记被剥离后名称为空串（research §2：目录 = 名称尾 `/`，`slice(0,-1)`）
    expect(nodeById(SAMPLE, 'treeview-node:1')).toMatchObject({ name: '', isDirectory: true, level: 0 })
    expect(nodeById(SAMPLE, 'treeview-node:2')).toMatchObject({ name: 'src', isDirectory: true, level: 4 })
    expect(nodeById(SAMPLE, 'treeview-node:3')).toMatchObject({ name: 'main.ts', isDirectory: false, level: 8 })
    expect(nodeById(SAMPLE, 'treeview-node:4')).toMatchObject({ name: 'utils.ts', isDirectory: false, level: 8 })
    expect(nodeById(SAMPLE, 'treeview-node:5')).toMatchObject({ name: 'docs', isDirectory: true, level: 4 })
    expect(nodeById(SAMPLE, 'treeview-node:6')).toMatchObject({ name: 'README.md', isDirectory: false, level: 8 })
  })

  it('tab 缩进记 1 个字符（research 坑 1：level = input.length）', () => {
    const n = nodeById('treeView-beta\n/\n\tsrc/\n', 'treeview-node:2')
    expect(n.level).toBe(1)
    expect(n.indent).toBe('\t')
  })

  it('目录 = 名称去引号后以 `/` 结尾（research 坑 4）', () => {
    expect(nodeById(SAMPLE, 'treeview-node:2')).toMatchObject({ name: 'src', isDirectory: true })
    expect(nodeById(SAMPLE, 'treeview-node:3')).toMatchObject({ name: 'main.ts', isDirectory: false })
  })

  it('引号名去引号；引号内的 `/` 同样判目录（research 坑 4）', () => {
    const n = nodeById('treeView-beta\n"my dir/"\n', 'treeview-node:1')
    expect(n).toMatchObject({ quote: '"', name: 'my dir', isDirectory: true })
  })

  it('裸名允许内部空格（终止于注解前瞻或行尾）', () => {
    const n = nodeById('treeView-beta\nmy folder\n', 'treeview-node:1')
    expect(n).toMatchObject({ quote: null, name: 'my folder', isDirectory: false })
  })
})

describe('treeview 解析器：行内注解（research §1，可任意顺序）', () => {
  it(':::class 注解被切出，名称不含注解', () => {
    const n = nodeById('treeView-beta\nsrc/ :::highlight\n', 'treeview-node:1')
    expect(n).toMatchObject({ name: 'src', isDirectory: true, classRaw: ':::highlight' })
  })

  it('icon(...) 注解被切出', () => {
    const n = nodeById('treeView-beta\nmain.ts icon(file)\n', 'treeview-node:1')
    expect(n).toMatchObject({ name: 'main.ts', iconRaw: 'icon(file)' })
  })

  it('## 描述注解被切出', () => {
    const n = nodeById('treeView-beta\nsrc/ ## 源代码\n', 'treeview-node:1')
    expect(n).toMatchObject({ name: 'src', isDirectory: true, descRaw: '## 源代码' })
  })

  it('多个注解任意顺序都识别', () => {
    const n = nodeById('treeView-beta\nsrc/ icon(logos:react) :::big ## 源\n', 'treeview-node:1')
    expect(n).toMatchObject({
      name: 'src',
      classRaw: ':::big',
      iconRaw: 'icon(logos:react)',
      descRaw: '## 源',
    })
  })

  it('多个注解（含 ## 吞到行尾）：三者独立切出且重组装逐字相同', () => {
    const src = 'treeView-beta\n/\n    App.tsx :::highlight icon(logos:react) ## 主组件\n    utils.ts ## 工具函数\n'
    const doc = parseOk(src)
    const app = nodeById(src, 'treeview-node:2')
    expect(app).toMatchObject({
      name: 'App.tsx',
      classRaw: ':::highlight',
      iconRaw: 'icon(logos:react)',
      descRaw: '## 主组件',
    })
    const utils = nodeById(src, 'treeview-node:3')
    expect(utils).toMatchObject({ name: 'utils.ts', descRaw: '## 工具函数' })
    expect(reassemble(doc, new Map())).toBe(src)
  })

  it('未知 / 重复注解：整行不识别（逐字保留，不报错）', () => {
    // 重复 ::: 使 parseNodeContent 返回 null → 该行无 treeview-node 元素
    const doc = parseOk('treeView-beta\nsrc/ :::a :::b\n')
    expect(doc.elements.some((e) => e.id === 'treeview-node:1')).toBe(false)
  })
})

describe('treeview 解析器：verbatim 边界（ADR-0004/0008）', () => {
  it('无修改重组装 = 逐字相同', () => {
    expect(reassemble(parseOk(SAMPLE), new Map())).toBe(SAMPLE)
  })

  it('frontmatter / 注释 / 空行 / 含 box-drawing 的行原样保留', () => {
    const src = `---
title: 演示
---
treeView-beta
/
    src/
        %% 这是注释

├── 甲
`
    const doc = parseOk(src)
    // box-drawing 行与注释行不产生节点元素
    expect(doc.elements.filter((e) => e.element.kind === 'treeview-node').length).toBe(2)
    expect(reassemble(doc, new Map())).toBe(src)
  })
})

describe('treeview 解析器：编辑意图（手术式改写保 verbatim）', () => {
  const apply = (src: string, intent: Parameters<typeof treeviewParser.resolveRewrites>[1]): string => {
    const doc = parseOk(src)
    const rewrites = treeviewParser.resolveRewrites(doc, intent)
    if (rewrites === null) throw new Error('意图被拒绝')
    return reassemble(doc, rewrites)
  }

  it('改名时注解段（含多空白）逐字搬运，不被归一化', () => {
    // 名称与注解之间、注解之间用多空格：改名后这些空白原样保留
    const src = 'treeView-beta\nold.ts :::a  icon(file)   ## 说明\n'
    const out = apply(src, { type: 'set-node-name', elementId: 'treeview-node:1', name: 'new.ts' })
    expect(out).toBe('treeView-beta\nnew.ts :::a  icon(file)   ## 说明\n')
  })

  it('set-node-name：只改目标行的名称，其余逐字不动', () => {
    const out = apply(SAMPLE, { type: 'set-node-name', elementId: 'treeview-node:3', name: 'index.ts' })
    expect(out).toBe(SAMPLE.replace('        main.ts', '        index.ts'))
  })

  it('set-node-directory：在名称尾增删 `/`', () => {
    const add = apply(SAMPLE, { type: 'set-node-directory', elementId: 'treeview-node:3', isDirectory: true })
    expect(add).toContain('        main.ts/')
    const rm = apply(SAMPLE, { type: 'set-node-directory', elementId: 'treeview-node:2', isDirectory: false })
    expect(rm).toContain('    src\n')
  })

  it('add-child：落在父节点整棵子树之后，缩进深一档', () => {
    const out = apply(SAMPLE, { type: 'add-child', parentElementId: 'treeview-node:2', name: 'helper.ts' })
    // src/ 子树（src/、main.ts、utils.ts）之后、docs/ 之前
    const idx = out.indexOf('        helper.ts')
    expect(idx).toBeGreaterThan(out.indexOf('        utils.ts'))
    expect(idx).toBeLessThan(out.indexOf('    docs/'))
  })

  it('add-child：目录名带尾 `/`（isDirectory）', () => {
    const out = apply(SAMPLE, { type: 'add-child', parentElementId: 'treeview-node:2', name: 'sub', isDirectory: true })
    expect(out).toContain('        sub/')
  })

  it('add-sibling：落在目标子树之后，同缩进', () => {
    const out = apply(SAMPLE, { type: 'add-sibling', elementId: 'treeview-node:2', name: 'tests', isDirectory: true })
    expect(out).toContain('    tests/')
    // tests/ 在 src/ 子树之后
    expect(out.indexOf('    tests/')).toBeGreaterThan(out.indexOf('        utils.ts'))
  })

  it('delete-node：连同子树一并移除，不留空行', () => {
    const out = apply(SAMPLE, { type: 'delete-node', elementId: 'treeview-node:2' })
    expect(out).not.toContain('src')
    expect(out).not.toContain('main.ts')
    expect(out).not.toContain('utils.ts')
    expect(out).toContain('docs/')
    expect(out).toBe(`treeView-beta
/
    docs/
        README.md
`)
  })

  it('空树 add-child（父为空串占位）：顶格追加在 header 之后', () => {
    const out = apply('treeView-beta\n', { type: 'add-child', parentElementId: '', name: 'first', isDirectory: true })
    expect(out).toBe('treeView-beta\nfirst/\n')
  })

  it('无效名称被拒绝（空 / 含引号 / 含换行）', () => {
    const doc = parseOk(SAMPLE)
    expect(treeviewParser.resolveRewrites(doc, { type: 'set-node-name', elementId: 'treeview-node:3', name: '  ' })).toBeNull()
    expect(treeviewParser.resolveRewrites(doc, { type: 'set-node-name', elementId: 'treeview-node:3', name: 'a"b' })).toBeNull()
    expect(treeviewParser.resolveRewrites(doc, { type: 'add-sibling', elementId: 'treeview-node:3', name: 'a\nb' })).toBeNull()
  })

  it('不存在的 elementId → null', () => {
    const doc = parseOk(SAMPLE)
    expect(treeviewParser.resolveRewrites(doc, { type: 'delete-node', elementId: 'treeview-node:999' })).toBeNull()
    expect(treeviewParser.resolveRewrites(doc, { type: 'set-node-name', elementId: 'nope', name: 'x' })).toBeNull()
  })
})

describe('treeview 解析器：辅助函数', () => {
  it('isValidTreeviewName：非空、单行、不含引号', () => {
    expect(isValidTreeviewName('main.ts')).toBe(true)
    expect(isValidTreeviewName('my file')).toBe(true)
    expect(isValidTreeviewName('')).toBe(false)
    expect(isValidTreeviewName('   ')).toBe(false)
    expect(isValidTreeviewName('a"b')).toBe(false)
    expect(isValidTreeviewName("a'b")).toBe(false)
    expect(isValidTreeviewName('a\nb')).toBe(false)
  })

  it('renderTreeviewNode：改名 / 切目录保留缩进、引号与注解', () => {
    const base: TreeviewNodeData = {
      kind: 'treeview-node',
      indent: '  ',
      level: 2,
      quote: '"',
      name: 'src',
      isDirectory: true,
      nameTrailing: ' ',
      annSegment: ' :::big',
      classRaw: ':::big',
      iconRaw: null,
      descRaw: null,
      trailing: '',
      eol: '\n',
    }
    expect(renderTreeviewNode(base, { name: 'bin' })).toBe('  "bin/" :::big\n')
    expect(renderTreeviewNode(base, { isDirectory: false })).toBe('  "src" :::big\n')  })

  it('TreeviewParser 可独立实例化（无隐藏单例状态）', () => {
    const p = new TreeviewParser()
    expect(p.parse(SAMPLE).ok).toBe(true)
  })
})
