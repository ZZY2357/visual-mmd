import { describe, expect, it } from 'vitest'
import {
  isContiguousFieldSequence,
  isValidPacketFieldName,
  parsePacketForm,
  packetParser,
  type PacketFieldData,
} from '../packet'
import { PACKET_TEMPLATE } from '../../diagram-registry'
import { reassemble } from '../document'

/**
 * packet 解析器测试（more-diagrams 工单 16）：verbatim identity（ADR-0004，含模板）、
 * 解析（声明头 packet/packet-beta、三种位形态、松散空白、行尾注释）、区间归一与
 * 连续性校验（mermaid 12 实测：间隙/重叠/回退整图抛错，research「连续/递增由校验层
 * 负责」）、意图往返（加字段 +count / 改名 / 改位区间绝对形态 / 删除）、错误边界
 * （不连续结果拒绝落码 / 回退区间与零计数不解析 / 清单外意图不接）。
 */

const SAMPLE = `packet
    0-15: "Source Port"
    16-31: "Destination Port"
    +16: "Flags" %% 计数位
`

function parse(source: string) {
  const r = packetParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

/** 应用意图并重组装（返回新源码），意图被拒时抛错 */
function apply(source: string, intent: Parameters<typeof packetParser.resolveRewrites>[1]) {
  const doc = parse(source)
  const rewrites = packetParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return reassemble(doc, rewrites)
}

function fieldOf(doc: ReturnType<typeof parse>, id: string): PacketFieldData {
  const part = doc.elements.find((p) => p.id === id)
  if (part === undefined || part.element.kind !== 'packet-field') {
    throw new Error(`元素不存在或不是字段：${id}`)
  }
  return part.element as PacketFieldData
}

describe('verbatim identity（ADR-0004）', () => {
  it('样例源码原样重组装（含 +count / 单 bit / 松散空白 / 行尾注释）', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('起步模板原样重组装', () => {
    expect(reassemble(parse(PACKET_TEMPLATE))).toBe(PACKET_TEMPLATE)
  })

  it('frontmatter / 注释 / accTitle / accDescr（含多行）逐字保留', () => {
    const source = `---
title: 元数据
config:
  packet:
    bitsPerRow: 16
---
packet-beta
    %% 注释行
    accTitle: 无障碍标题
    accDescr: 单行描述
    accDescr {
        多行描述
        第二行
    }
    0-7: "甲"
    8-15: "乙"
`
    expect(reassemble(parse(source))).toBe(source)
  })
})

describe('解析（工单 16 范围）', () => {
  it('声明头：packet 与 packet-beta 都认；元素 id 位置序 field:N（ADR-0012）', () => {
    expect(packetParser.parse('packet\n0-7: "A"\n').ok).toBe(true)
    expect(packetParser.parse('packet-beta\n0-7: "A"\n').ok).toBe(true)
    const doc = parse(SAMPLE)
    expect(doc.elements.map((p) => p.id)).toEqual([
      'packet-header',
      'field:1',
      'field:2',
      'field:3',
    ])
  })

  it('三种位形态逐字段解析；prefixRaw 保留原文；注释进 tail；single 形态 = 1 bit', () => {
    const doc = parse(SAMPLE)
    expect(fieldOf(doc, 'field:1')).toMatchObject({
      prefixRaw: '0-15',
      form: { kind: 'range', start: '0', end: '15' },
      name: 'Source Port',
      gap1: '',
      gap2: ' ',
      tail: '',
    })
    expect(fieldOf(doc, 'field:3')).toMatchObject({
      prefixRaw: '+16',
      form: { kind: 'count', count: '16' },
      name: 'Flags',
      tail: ' %% 计数位',
    })
    const single = parse('packet\n0: "一位"\n1-15: "其余"\n')
    expect(fieldOf(single, 'field:1')).toMatchObject({
      form: { kind: 'single', start: '0' },
      name: '一位',
    })
  })

  it('松散空白（`0 - 15 : "A"` / `+ 8 :"B"`）按原文保留在 prefixRaw / gap', () => {
    const doc = parse('packet\n0 - 15 : "A"\n+8:"B"\n')
    expect(fieldOf(doc, 'field:1')).toMatchObject({
      prefixRaw: '0 - 15',
      gap1: ' ',
      gap2: ' ',
    })
    expect(fieldOf(doc, 'field:2')).toMatchObject({
      prefixRaw: '+8',
      gap1: '',
      gap2: '',
    })
  })

  it('名称为引号内原文（可含冒号与空格，无转义机制）', () => {
    const doc = parse('packet\n0-7: "A: B C"\n')
    expect(fieldOf(doc, 'field:1')).toMatchObject({ name: 'A: B C' })
  })

  it('mermaid 抛错的行整行不认（逐字保留，不产出幽灵元素）：回退区间 / 零计数 / 前导零 / 负数 / 裸名 / 分号', () => {
    const source = `packet
    5-3: "回退"
    +0: "零计数"
    00-15: "前导零"
    -1-15: "负数"
    0-15: 裸名
    0-15: "A";
`
    const doc = parse(source)
    expect(doc.elements.map((p) => p.id)).toEqual(['packet-header'])
    expect(reassemble(parse(source))).toBe(source)
  })

  it('声明头缺失 / 首行不是 packet → 解析错误', () => {
    expect(packetParser.parse('0-15: "A"')).toMatchObject({ ok: false })
    expect(packetParser.parse('')).toMatchObject({ ok: false })
  })
})

describe('校验助手（表单与落码门共用，避免第二份实现）', () => {
  it('parsePacketForm：三种形态；回退区间 / 零计数 / 非法数字 → null', () => {
    expect(parsePacketForm('0-15')).toEqual({ kind: 'range', start: '0', end: '15' })
    expect(parsePacketForm('0 - 15')).toEqual({ kind: 'range', start: '0', end: '15' })
    expect(parsePacketForm('+ 8')).toEqual({ kind: 'count', count: '8' })
    expect(parsePacketForm('5')).toEqual({ kind: 'single', start: '5' })
    expect(parsePacketForm('5-3')).toBeNull()
    expect(parsePacketForm('+0')).toBeNull()
    expect(parsePacketForm('00')).toBeNull()
    expect(parsePacketForm('-1')).toBeNull()
    expect(parsePacketForm('1.5')).toBeNull()
  })

  it('isValidPacketFieldName：非空、不含引号与换行', () => {
    expect(isValidPacketFieldName('Source Port')).toBe(true)
    expect(isValidPacketFieldName('')).toBe(false)
    expect(isValidPacketFieldName('  ')).toBe(false)
    expect(isValidPacketFieldName('含"引号')).toBe(false)
    expect(isValidPacketFieldName('含\n换行')).toBe(false)
  })
})

describe('区间归一与连续性校验（工单 16 落码门）', () => {
  const form = (s: string) => parsePacketForm(s)!

  it('连续序列通过（显式起点精确衔接、count 自动衔接、首字段从 0 起）', () => {
    expect(isContiguousFieldSequence([])).toBe(true)
    expect(isContiguousFieldSequence([{ form: form('0-15') }, { form: form('16-31') }, { form: form('+16') }])).toBe(true)
    expect(isContiguousFieldSequence([{ form: form('+8') }, { form: form('+8') }])).toBe(true)
    expect(isContiguousFieldSequence([{ form: form('0') }, { form: form('1-15') }])).toBe(true)
  })

  it('间隙 / 重叠 / 回退 / 首字段非 0 起被拒（mermaid 12 实测：三者同样整图抛错）', () => {
    // 间隙（首字段不从 0 起）
    expect(isContiguousFieldSequence([{ form: form('4-11') }])).toBe(false)
    // 间隙（中段）
    expect(isContiguousFieldSequence([{ form: form('0-15') }, { form: form('20-31') }])).toBe(false)
    // 重叠
    expect(isContiguousFieldSequence([{ form: form('0-15') }, { form: form('9-15') }])).toBe(false)
    // 回退
    expect(isContiguousFieldSequence([{ form: form('16-31') }, { form: form('0-15') }])).toBe(false)
    // count 形态无法补救前序断链
    expect(isContiguousFieldSequence([{ form: form('4-11') }, { form: form('+8') }])).toBe(false)
  })
})

describe('意图往返（编辑 → 落码 → 再解析）', () => {
  it('add-field：缺省锚点追加在文档末尾，落 `+count: "名称"`（+count 形态衔接前序）', () => {
    const source = apply(SAMPLE, { type: 'add-field', name: '新字段', count: '8' })
    expect(source.endsWith('    +8: "新字段"\n')).toBe(true)
    const doc = parse(source)
    expect(fieldOf(doc, 'field:4')).toMatchObject({
      form: { kind: 'count', count: '8' },
      name: '新字段',
    })
  })

  it('add-field 带锚点：落在锚点行之后，缩进跟随锚点行；后续 +count 字段自动衔接', () => {
    const source = apply(SAMPLE, {
      type: 'add-field',
      name: '第二位',
      count: '4',
      afterElementId: 'field:2',
    })
    expect(source).toContain('16-31: "Destination Port"\n    +4: "第二位"\n    +16: "Flags"')
  })

  it('set-field-name：只改名称，位前缀 / 空白 / 注释逐字保留', () => {
    const source = apply(SAMPLE, { type: 'set-field-name', elementId: 'field:2', name: '目的端口' })
    expect(source).toContain('16-31: "目的端口"')
    expect(source).toContain('+16: "Flags" %% 计数位')
  })

  it('set-field-range：以 start-end 绝对形态落码（工单定案），+count 形态被整段重写', () => {
    const source = apply(SAMPLE, { type: 'set-field-range', elementId: 'field:3', start: '32', end: '39' })
    expect(source).toContain('32-39: "Flags"')
    expect(reassemble(parse(source))).toBe(source)
  })

  it('set-field-range：把 16-31 改为 16-23（保持衔接的收窄）合法，+count 字段随之衔接', () => {
    const source = apply(SAMPLE, { type: 'set-field-range', elementId: 'field:2', start: '16', end: '23' })
    expect(source).toContain('16-23: "Destination Port"')
    expect(source).toContain('+16: "Flags"')
  })

  it('场景偏差记录（工单 Comments）：显式起点字段的起点不可位移——4-11 重排被连续性校验拒绝', () => {
    // mermaid 12 对全序列强制连续（间隙/重叠/回退整图抛错，实测）；因此
    // 「把一个字段改为 4-11 区间」无法在显式起点后继（16-31）存在时落码——
    // 工单场景改以「16-31 → 16-23 收窄」与「+16 → 32-39 绝对形态」覆盖改位能力。
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-field-range',
        elementId: 'field:2',
        start: '4',
        end: '11',
      }),
    ).toBeNull()
  })

  it('delete-field：删 +count 前的字段合法（后续 +count 自动衔接），语句行移除其余逐字保留', () => {
    const source = apply(SAMPLE, { type: 'delete-field', elementId: 'field:2' })
    expect(source).not.toContain('Destination Port')
    expect(source).toContain('0-15: "Source Port"')
    expect(source).toContain('+16: "Flags" %% 计数位')
  })

  it('delete-field：删最后一个字段恒合法', () => {
    const source = apply(SAMPLE, { type: 'delete-field', elementId: 'field:3' })
    expect(source).not.toContain('Flags')
  })

  it('编辑后再解析仍 verbatim identity（往返稳定性，含绝对形态改写后的行）', () => {
    const once = apply(SAMPLE, { type: 'set-field-name', elementId: 'field:3', name: '标志位' })
    expect(reassemble(parse(once))).toBe(once)
  })
})

describe('错误边界（绝不产出非法 mermaid）', () => {
  it('结果序列不连续（间隙 / 重叠 / 回退）拒绝落码', () => {
    // 间隙：0-15 → 0-7 后，16-31 显式起点断链
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-field-range',
        elementId: 'field:1',
        start: '0',
        end: '7',
      }),
    ).toBeNull()
    // 重叠 / 位移：16-31 → 4-11（不衔接 field:1 的结束位）
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-field-range',
        elementId: 'field:2',
        start: '4',
        end: '11',
      }),
    ).toBeNull()
    // 回退：end < start
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-field-range',
        elementId: 'field:1',
        start: '15',
        end: '0',
      }),
    ).toBeNull()
    // 首字段不从 0 起
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-field-range',
        elementId: 'field:1',
        start: '4',
        end: '11',
      }),
    ).toBeNull()
  })

  it('add-field：零计数 / 非法数字 / 非法名称被拒', () => {
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), { type: 'add-field', name: 'x', count: '0' }),
    ).toBeNull()
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), { type: 'add-field', name: 'x', count: 'abc' }),
    ).toBeNull()
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), { type: 'add-field', name: '', count: '8' }),
    ).toBeNull()
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), { type: 'add-field', name: 'a"b', count: '8' }),
    ).toBeNull()
  })

  it('add-field：锚点后存在显式起点字段时（位移断链）被拒', () => {
    // SAMPLE 的 field:1 之后插 +count，会把 16-31 顶到 8-23 → 断链
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), {
        type: 'add-field',
        name: 'x',
        count: '8',
        afterElementId: 'field:1',
      }),
    ).toBeNull()
  })

  it('delete-field：删除后显式起点字段位移断链被拒', () => {
    // 删 field:1（0-15）后 16-31 起点非 0 → 断链
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), { type: 'delete-field', elementId: 'field:1' }),
    ).toBeNull()
  })

  it('目标不存在 / 名称非法 / 清单外意图不接（返回 null）', () => {
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-field-name',
        elementId: 'field:99',
        name: 'x',
      }),
    ).toBeNull()
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), { type: 'delete-field', elementId: 'field:99' }),
    ).toBeNull()
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-field-name',
        elementId: 'field:1',
        name: '',
      }),
    ).toBeNull()
    expect(
      packetParser.resolveRewrites(parse(SAMPLE), { type: 'add-node', nodeId: 'n1' }),
    ).toBeNull()
  })
})
