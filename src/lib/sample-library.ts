/**
 * 首启动示例图表（self-grill-hardening 工单 17）。
 *
 * 首次启动（图表库与旧版单图存档都不存在）时预置 3–5 张典型示例图，
 * 让新用户一进来就能「玩、拆、学」——空白画布不再是最差的第一屏。
 *
 * 本模块是**叶子**：只依赖 i18next（读界面语言），不 import i18n/index（避免
 * lib → i18n/index 的环，与 domain-strings 同思路）。示例名是用户可见文案，
 * 双语表在 `sampleNamesZh` / `sampleNamesEn` 内成文，并由 i18n/index 挂进字典
 * `library.samples`（zh/en 两处都要有，en-coverage.test.ts 审计）。
 *
 * 示例源码是**手写的起步级/中文样例**，全部通过真实 `mermaid.parse`
 * （sample-library.test.ts 逐条断言，复用金样机制）；不选 zenuml（外部渲染器，
 * 本仓测试环境 parse 不稳定）。
 */

import i18next from 'i18next'
import type { StoredLibraryDiagram } from './library-storage'

/** 示例图表名的中文表（键即示例的稳定身份） */
export const sampleNamesZh = {
  flowchart: '流程图：入门示例',
  sequence: '时序图：交互示例',
  class: '类图：领域模型示例',
  mindmap: '思维导图：功能导览',
  state: '状态图：流程示例',
} as const

/** 示例图表名的英文表（键与中文表一一对应） */
export const sampleNamesEn: Record<keyof typeof sampleNamesZh, string> = {
  flowchart: 'Flowchart: Getting started',
  sequence: 'Sequence: Interaction example',
  class: 'Class: Domain model example',
  mindmap: 'Mindmap: Feature tour',
  state: 'State: Workflow example',
}

/** 示例身份（与 sampleNames* 的键一致） */
export type SampleKey = keyof typeof sampleNamesZh

/** 一条示例图表的定义：稳定 id + 名字键 + 源码 */
export interface SampleDiagram {
  id: string
  nameKey: SampleKey
  source: string
}

/**
 * 预置示例（3–5 张，覆盖不同图种）。
 * 含 flowchart 与 sequence；其中 flowchart / sequence / state 三张都有连线与
 * 中文标签，适合练手（内联编辑 / 连线模式）。
 * id 是稳定常量：示例只在首启动写入一次，不需要时间戳。
 */
export const SAMPLE_DIAGRAMS: readonly SampleDiagram[] = [
  {
    id: 'sample-flowchart',
    nameKey: 'flowchart',
    source: `flowchart LR
    需求[收集需求] --> 设计[方案设计]
    设计 --> 开发[编码实现]
    开发 --> 测试{测试通过?}
    测试 -- 通过 --> 上线[发布上线]
    测试 -- 不通过 --> 开发
`,
  },
  {
    id: 'sample-sequence',
    nameKey: 'sequence',
    source: `sequenceDiagram
    用户->>系统: 打开图表库
    系统-->>用户: 渲染示例图
    用户->>系统: 修改节点文本
    系统-->>用户: 源码实时更新
    Note over 用户,系统: 双击画布节点即可内联编辑
`,
  },
  {
    id: 'sample-class',
    nameKey: 'class',
    source: `classDiagram
    账户 : +余额
    账户 : +取款(金额) 布尔
    储蓄账户 <|-- 账户
    储蓄账户 : +利率
`,
  },
  {
    id: 'sample-mindmap',
    nameKey: 'mindmap',
    source: `mindmap
  root((Visual MMD))
    图表库
      预置示例图
      新建图表
    可视化编辑
      结构树
      属性表单
    导出
      mmd
      svg
`,
  },
  {
    id: 'sample-state',
    nameKey: 'state',
    source: `stateDiagram-v2
    [*] --> 待办
    待办 --> 进行中 : 开始
    进行中 --> 待评审 : 提测
    待评审 --> 已完成 : 通过
    待评审 --> 进行中 : 打回
    已完成 --> [*]
`,
  },
]

function currentLanguage(): 'zh' | 'en' {
  return i18next.isInitialized && i18next.language === 'en' ? 'en' : 'zh'
}

/** 示例图表的用户可见名（双语，读界面语言；未初始化回落中文） */
export function sampleDiagramName(key: SampleKey): string {
  return currentLanguage() === 'en' ? sampleNamesEn[key] : sampleNamesZh[key]
}

/** 生成首启动预置的图表库条目（名字按当前界面语言本地化） */
export function createSampleDiagrams(): StoredLibraryDiagram[] {
  return SAMPLE_DIAGRAMS.map((sample) => ({
    id: sample.id,
    name: sampleDiagramName(sample.nameKey),
    source: sample.source,
    savedAt: 0,
  }))
}
