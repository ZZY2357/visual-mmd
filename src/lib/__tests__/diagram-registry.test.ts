import { describe, expect, it } from 'vitest'
import {
  detectDiagramType,
  DIAGRAM_TYPE_LIST,
  DIAGRAM_TYPES,
  type DiagramTypeRegistration,
} from '../diagram-registry'
import { useEditorStore } from '../../store/editor'

/**
 * 注册表与只读降级（more-diagrams 工单 01）：
 * - detectDiagramType 显式遍历注册表，无法识别时返回 null（unsupported 态），
 *   不再默认 flowchart——冷门图种不被 flowchart 解析器误吞；
 * - DiagramTypeId 是开放类型：注册表自洽性（id 唯一、模板自识别、投影包装同名）
 *   在这里用断言锁死，替代原封闭联合的编译期穷尽性；
 * - 双关键字图种（block/packet/xychart 的 -beta 变体）在接入前不落入任何已注册图种。
 */

const SOURCES = {
  flowchart: 'flowchart TD\n    A --> B\n',
  graph: 'graph LR\n    A --> B\n',
  sequence: 'sequenceDiagram\n    A->>B: 你好\n',
  class: 'classDiagram\n    class A\n',
  mindmap: 'mindmap\n  root((根))\n',
} as const

describe('detectDiagramType：已注册图种识别不变（回归）', () => {
  it('flowchart 与裸 graph 关键字识别为 flowchart', () => {
    expect(detectDiagramType(SOURCES.flowchart)?.id).toBe('flowchart')
    expect(detectDiagramType(SOURCES.graph)?.id).toBe('flowchart')
  })

  it('sequence / class / mindmap 各归各', () => {
    expect(detectDiagramType(SOURCES.sequence)?.id).toBe('sequence')
    expect(detectDiagramType(SOURCES.class)?.id).toBe('class')
    expect(detectDiagramType(SOURCES.mindmap)?.id).toBe('mindmap')
  })

  it('跳过 frontmatter 与注释后的首个语句行参与识别', () => {
    const source = `---\ntitle: 示例\n---\n%% 注释\n\nsequenceDiagram\n    A->>B: 你好\n`
    expect(detectDiagramType(source)?.id).toBe('sequence')
  })

  it('packet 与 packet-beta 双关键字同认（more-diagrams 工单 16）', () => {
    expect(detectDiagramType('packet\n    0-7: "x"\n')?.id).toBe('packet')
    expect(detectDiagramType('packet-beta\n    0-7: "x"\n')?.id).toBe('packet')
    // \b 防误吞：更长词根不落 packet
    expect(detectDiagramType('packetXxx\n')).toBeNull()
  })
})

describe('detectDiagramType：无法识别 → unsupported（null），绝不默认 flowchart', () => {
  it.each([
    ['纯文本', '这不是 Mermaid 源码\n'],
    ['空源码', ''],
    // block / block-beta 已注册（more-diagrams 工单 09）、packet / packet-beta 已注册
    //（more-diagrams 工单 16）、xychart / xychart-beta 已注册（more-diagrams 工单 14）、
    // venn-beta 已注册（more-diagrams 工单 21），均移入各自「返回 X」的用例
  ])('%s 返回 null', (_name, source) => {
    expect(detectDiagramType(source)).toBeNull()
  })

  it('flowchart 的 detect 不认领双关键字变体（原缺陷回归锁）', () => {
    for (const source of ['packet-beta\n', 'venn-beta\n']) {
      expect(DIAGRAM_TYPES.flowchart.detect(source)).toBe(false)
    }
  })

  it('block(-beta) 识别（more-diagrams 工单 09）：两个关键字都认领，不越界误判', () => {
    expect(detectDiagramType('block-beta\n    A\n')?.id).toBe('block')
    expect(detectDiagramType('block\n    A\n')?.id).toBe('block')
    // `\b` 防越界：嵌套块声明行 / 更长的词不被误吞
    expect(DIAGRAM_TYPES.block.detect('blockchain\n    A\n')).toBe(false)
    expect(DIAGRAM_TYPES.block.detect('block:gid\n    A\nend\n')).toBe(false)
  })

  it('sankey(-beta) 识别（more-diagrams 工单 13）：两个关键字都认领；声明行必须是裸关键字', () => {
    expect(detectDiagramType('sankey-beta\n\na,b,1\n')?.id).toBe('sankey')
    expect(detectDiagramType('sankey\n\na,b,1\n')?.id).toBe('sankey')
    // 正文是 CSV 流：带尾随内容的声明行不是表头，不认领
    expect(DIAGRAM_TYPES.sankey.detect('sankey-beta extra\na,b,1\n')).toBe(false)
  })

  it('xychart(-beta) 识别（more-diagrams 工单 14）：两个关键字都认领，方向修饰符可选；声明行带别的内容不认领', () => {
    expect(detectDiagramType('xychart-beta\nbar [1]\n')?.id).toBe('xychart')
    expect(detectDiagramType('xychart\nbar [1]\n')?.id).toBe('xychart')
    expect(detectDiagramType('xychart horizontal\nbar [1]\n')?.id).toBe('xychart')
    expect(detectDiagramType('XYCHART-BETA\nbar [1]\n')?.id).toBe('xychart')
    expect(DIAGRAM_TYPES.xychart.detect('xychart-beta extra\nbar [1]\n')).toBe(false)
  })

  it('architecture-beta 识别（more-diagrams 工单 17）：mermaid 词法只有这一个关键字；声明行必须是裸关键字', () => {
    expect(detectDiagramType('architecture-beta\n    service a\n')?.id).toBe('architecture')
    expect(detectDiagramType('ARCHITECTURE-BETA\n')?.id).toBe('architecture')
    expect(detectDiagramType('architecture\n    service a\n')?.id).toBeUndefined()
    expect(DIAGRAM_TYPES.architecture.detect('architecture-beta extra\n')).toBe(false)
    expect(DIAGRAM_TYPES.architecture.detect('architecture-betaX\n')).toBe(false)
  })

  it('treemap(-beta) 识别（more-diagrams 工单 20）：两个关键字都认领；声明行必须是裸关键字', () => {
    expect(detectDiagramType('treemap\n"甲": 1\n')?.id).toBe('treemap')
    expect(detectDiagramType('treemap-beta\n"甲": 1\n')?.id).toBe('treemap')
    expect(detectDiagramType('TREEMAP\n')).toBeNull()
    // 首行必须是关键字本身（research §1），带尾随内容的行不是表头
    expect(DIAGRAM_TYPES.treemap.detect('treemap extra\n"甲": 1\n')).toBe(false)
    expect(DIAGRAM_TYPES.treemap.detect('treemapX\n"甲": 1\n')).toBe(false)
  })

  it('ishikawa(-beta) 识别（more-diagrams 工单 22）：两个关键字都认领且大小写不敏感；声明行必须是裸关键字', () => {
    expect(detectDiagramType('ishikawa-beta\n    甲\n')?.id).toBe('ishikawa')
    expect(detectDiagramType('ishikawa\n    甲\n')?.id).toBe('ishikawa')
    // 词法带 /i（research §1：jison 词法规则 1/2 均带 /i）
    expect(detectDiagramType('ISHIKAWA-BETA\n    甲\n')?.id).toBe('ishikawa')
    expect(DIAGRAM_TYPES.ishikawa.detect('Ishikawa\n    甲\n')).toBe(true)
    // 声明行必须是关键字本身（首行即关键字），带尾随内容或更长词不认领
    expect(DIAGRAM_TYPES.ishikawa.detect('ishikawa extra\n    甲\n')).toBe(false)
    expect(DIAGRAM_TYPES.ishikawa.detect('ishikawaX\n    甲\n')).toBe(false)
  })

  it('wardley-beta 识别（more-diagrams 工单 23）：探测器大小写不敏感（mermaid 口径）', () => {
    expect(detectDiagramType('wardley-beta\ncomponent "茶" [0.5, 0.5]\n')?.id).toBe('wardley')
    expect(detectDiagramType('WARDLEY-BETA\n')?.id).toBe('wardley')
    // `\b` 防止 wardleyXxx 被误认
    expect(DIAGRAM_TYPES.wardley.detect('wardley-betaX\n')).toBe(false)
    expect(DIAGRAM_TYPES.wardley.detect('flowchart TB\n A-->B')).toBe(false)
  })

  it('venn-beta 识别（more-diagrams 工单 21）：只有小写关键字；裸 venn 不认领', () => {
    expect(detectDiagramType('venn-beta\n    set a\n')?.id).toBe('venn')
    // mermaid 探测器 `/^\s*venn-beta/` 大小写敏感、无 (-beta)? 分支（research §8 实测）：
    // 裸 `venn` 与大小写变体都不被认领
    expect(detectDiagramType('venn\n    set a\n')).toBeNull()
    expect(detectDiagramType('VENN-BETA\n')).toBeNull()
    expect(DIAGRAM_TYPES.venn.detect('venn-beta extra\n    set a\n')).toBe(false)
    expect(DIAGRAM_TYPES.venn.detect('venn-betaX\n')).toBe(false)
  })

  it('cynefin-beta 识别（more-diagrams 工单 25）：**大小写敏感**（与 ishikawa/wardley 的 /i 不同，research §1）', () => {
    expect(detectDiagramType('cynefin-beta\ncomplex\n')?.id).toBe('cynefin')
    // 尾冒号可选（research §1：`cynefin-beta:` 亦合法）
    expect(detectDiagramType('cynefin-beta:\ncomplex\n')?.id).toBe('cynefin')
    // 大小写敏感：大写不认领（mermaid 词法无 /i，research §1 命令级实测）
    expect(detectDiagramType('Cynefin-Beta\ncomplex\n')).toBeNull()
    expect(DIAGRAM_TYPES.cynefin.detect('CYNEFIN-BETA\n')).toBe(false)
    // 声明行必须是裸关键字（首行即关键字），带尾随内容不认领
    expect(DIAGRAM_TYPES.cynefin.detect('cynefin-beta extra\ncomplex\n')).toBe(false)
    expect(DIAGRAM_TYPES.cynefin.detect('cynefin\ncomplex\n')).toBe(false)
  })

  it('usecase-beta 识别（more-diagrams 工单 26）：只有小写关键字与可选方向修饰符；裸 usecase 不认领', () => {
    expect(detectDiagramType('usecase-beta\n    actor A\n')?.id).toBe('usecase')
    expect(detectDiagramType('usecase-beta TB\n    actor A\n')?.id).toBe('usecase')
    // mermaid 探测器 `/^\s*usecase-beta(?:\s|$)/`、词法 `keyword("USECASE", /usecase-beta/)`（research §1 实测）：
    // 裸 `usecase`、大小写变体、带其它尾随内容都不认领
    expect(detectDiagramType('usecase\n    actor A\n')).toBeNull()
    expect(detectDiagramType('USECASE-BETA\n')).toBeNull()
    expect(DIAGRAM_TYPES.usecase.detect('usecase-beta extra\n    actor A\n')).toBe(false)
    expect(DIAGRAM_TYPES.usecase.detect('usecase-betaX\n')).toBe(false)
  })

  it('treeView-beta 识别（more-diagrams 工单 24）：只有 -beta 一个关键字且大小写敏感；声明行必须是裸关键字', () => {
    expect(detectDiagramType('treeView-beta\n/\n    src/\n')?.id).toBe('treeview')
    // Langium 关键字大小写敏感（research §1：探测器 `/^\\s*treeView-beta/` 无 i 位）：
    // 大小写不符、或裸 `treeView`（无 -beta）都不认领
    expect(detectDiagramType('TREEVIEW-BETA\n/\n')).toBeNull()
    expect(detectDiagramType('treeview-beta\n/\n')).toBeNull()
    expect(detectDiagramType('treeView\n/\n')).toBeNull()
    // 声明行必须是关键字本身（首行即关键字），带尾随内容或更长词不认领
    expect(DIAGRAM_TYPES.treeview.detect('treeView-beta extra\n/\n')).toBe(false)
    expect(DIAGRAM_TYPES.treeview.detect('treeView-betaX\n/\n')).toBe(false)
  })

  it('双关键字 detect 例（后续图种工单的写法约定）：-beta 可选且不越界误判', () => {
    // 后续 block/packet/xychart 工单应采用 `^<kw>(-beta)?\b` 形态；这里把形态锁死：
    // 可选 -beta 不妨碍裸关键字的识别，也不把更长的词（如 block-chain）误吞。
    const dualKeyword = /^(?:block|packet|xychart)(-beta)?\b/i
    expect(dualKeyword.test('block-beta\n')).toBe(true)
    expect(dualKeyword.test('block\n')).toBe(true)
    expect(dualKeyword.test('xychart\n')).toBe(true)
    expect(dualKeyword.test('blockchain\n')).toBe(false)
  })
})

describe('注册表自洽性（开放 DiagramTypeId 的运行期穷尽性）', () => {
  it('DIAGRAM_TYPES 与 DIAGRAM_TYPE_LIST 键一致、id 唯一', () => {
    const ids = DIAGRAM_TYPE_LIST.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(DIAGRAM_TYPES).sort()).toEqual([...ids].sort())
    for (const registration of DIAGRAM_TYPE_LIST) {
      expect(DIAGRAM_TYPES[registration.id]).toBe(registration)
    }
  })

  it('每张注册的模板被自己的 detect 认领、不被其它注册抢先', () => {
    for (const registration of DIAGRAM_TYPE_LIST) {
      expect(registration.detect(registration.template), registration.id).toBe(true)
      for (const other of DIAGRAM_TYPE_LIST) {
        if (other.id !== registration.id) {
          expect(other.detect(registration.template), `${other.id} 误认领 ${registration.id}`).toBe(false)
        }
      }
    }
  })

  it('buildProjection 返回的包装与注册 id 同名（{ type: id, [id]: projection }）', () => {
    for (const registration of DIAGRAM_TYPE_LIST) {
      const parsed = registration.parser.parse(registration.template)
      expect(parsed.ok, registration.id).toBe(true)
      if (!parsed.ok) continue
      const projection = registration.buildProjection(parsed.doc)
      expect(projection.type).toBe(registration.id)
      expect(projection).toHaveProperty(registration.id)
    }
  })
})

describe('unsupported 态的编辑路径', () => {
  it('commitIntent 在 unsupported 源码上拒绝（不喂给 flowchart 解析器）', () => {
    const unsupportedSource = 'unknownDiagram\n    A o B\n'
    useEditorStore.setState({ source: unsupportedSource })
    const applied = useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    expect(applied).toBe(false)
    expect(useEditorStore.getState().source).toBe(unsupportedSource)
  })
})

/** 类型层冒烟：registration.id 是字面量联合成员，buildProjection 产物可赋给 AnyProjection */
type _Smoke = DiagramTypeRegistration['id'] extends string ? true : false
const _smoke: _Smoke = true
void _smoke
