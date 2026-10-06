/**
 * DOM 契约冒烟夹具（ticket 08）——静态页，不驱动整个 app。
 *
 * 做什么：把金样语料（ticket 05 的 GOLDEN_CORPUS）逐图种喂给真实 mermaid 渲染，
 * 再把**画布组件那条渲染后处理链**逐字复用一遍（annotateNodeDataIds →
 * nodeAnnotator → edgeAnnotator → addEdgeHitAreas），最后把「DOM 里出现了哪些
 * data-id / 其中哪些能被该图种的 resolver 认领 / 能力包声明的 navigationIds
 * 是否在 DOM 里找得到」汇总成 JSON 挂在 window.__smoke 上，供 Playwright 断言。
 *
 * 为什么复用 src 里的后处理函数而不是自己写一套：冒烟要钉的正是「app 的
 * data-id 寻址链路在真实浏览器里成立」，自己重写就测了别的东西。夹具只 import，
 * 不改 src 任何生产代码。
 *
 * 为什么静态夹具而非驱动 app：见 e2e/harness/index.html 头注释与 ADR-0018。
 *
 * 只渲染每图种的**第一条金样**（起步级）——31 种图各一帧，足以覆盖「data-id 契约」
 * 这条与图种无关的链路，且把总时长压在 CI 的 30s 上限内。金样全量的语法合法性由
 * 单测 golden-validity.test.ts 承担（不需要浏览器）。
 *
 * zenuml（外部渲染器）**跳过渲染**：它是本仓唯一的外部图种，且按 ADR-0007 画布
 * **整体不可寻址**（zenuml-adapter 的 nonAddressableCapabilities），渲染它对
 * data-id 契约零增益；而 `@mermaid-js/mermaid-zenuml` 懒加载的 @zenuml/core 有
 * 37MB，在 dev server 下按模块粒度服务会直接吃掉 30s 预算。故夹具只登记其
 * 「外部 + 非可寻址」声明，不渲染——冒烟断言的正是「声明被如实兑现」。
 */
import mermaid from 'mermaid'
import {
  DIAGRAM_TYPES,
  type AnyDiagramTypeRegistration,
  type AnyProjection,
} from '../../src/lib/diagram-registry'
import { GOLDEN_CORPUS, type GoldenSample } from '../../src/lib/golden-corpus'
import { capabilitiesOf } from '../../src/lib/canvas-selection/capabilities'
import { addEdgeHitAreas } from '../../src/lib/canvas-selection/edge-hit-area'
import { annotateNodeDataIds } from '../../src/lib/canvas-selection/node-data-ids'
import { matchesDataId } from '../../src/lib/canvas-selection/highlight'

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })

/** 渲染 id 序号（与 app 的 use-mermaid-preview 同形：`mmd-preview-N`，见 smokeSample 注释） */
let renderSeq = 0

/** 单个金样的冒烟结果（序列化给 Playwright 断言） */
interface SmokeSampleResult {
  type: string
  kind: GoldenSample['kind']
  description: string
  external: boolean
  /** 外部图种按设计跳过渲染（见文件头注释） */
  skipped: boolean
  rendered: boolean
  error: string | null
  /** 能力包是否声明该图种可寻址（navigationIds 非空，或实现了连线/节点反注） */
  declaresAddressable: boolean
  /** 渲染产物里全部 data-id 值（去重） */
  dataIdsInDom: string[]
  /** 其中能被该图种 resolver 认领的 data-id（= 画布点击链路可寻址的） */
  resolvedDataIds: string[]
  /** 能力包声明的节点 id（navigationIds），供断言「声明兑现」 */
  navigationIds: string[]
  /** navigationIds 里在 DOM 中找不到对应元素（data-id 或 DOM id 后缀）的那些 */
  missingNavigationIds: string[]
}

interface SmokeResult {
  ok: boolean
  samples: SmokeSampleResult[]
}

declare global {
  interface Window {
    __smoke?: Promise<SmokeResult>
  }
}

/** 把一个样本渲染进独立宿主，跑完 app 的渲染后处理链，收集契约事实。 */
async function smokeSample(
  type: string,
  sample: GoldenSample,
  index: number,
  external: boolean,
): Promise<SmokeSampleResult> {
  const base: SmokeSampleResult = {
    type,
    kind: sample.kind,
    description: sample.description,
    external,
    skipped: false,
    rendered: false,
    error: null,
    declaresAddressable: false,
    dataIdsInDom: [],
    resolvedDataIds: [],
    navigationIds: [],
    missingNavigationIds: [],
  }

  const host = document.createElement('div')
  host.className = 'smoke-host'
  host.dataset.diagramType = type
  host.dataset.sampleIndex = String(index)
  document.getElementById('smoke-hosts')!.appendChild(host)

  try {
    await mermaid.parse(sample.source)
    // 渲染 id 必须与 app 同形（`mmd-preview-N`）——**不能含图种名**：多个 adapter 的
    // DOM id 反注正则（如 agentflow 的 `(?:^|-)agentflow-(.+)-(\d+)$`）会从左most
    // 命中，若渲染 id 里带 "agentflow" 就会截错节点 id（夹具早期版本的真实踩坑）。
    const { svg } = await mermaid.render(`mmd-preview-${++renderSeq}`, sample.source)
    host.innerHTML = svg
    base.rendered = true
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err)
    return base
  }

  // 投影（与 app 同源：注册表解析器 → buildProjection）
  const registration = (DIAGRAM_TYPES as Record<string, (typeof DIAGRAM_TYPES)[keyof typeof DIAGRAM_TYPES]>)[type]
  if (registration === undefined) {
    base.error = `未注册图种：${type}`
    return base
  }
  const parsed = registration.parser.parse(sample.source)
  if (!parsed.ok) {
    base.error = `投影解析失败：${parsed.error.message}`
    return base
  }
  const projection: AnyProjection = registration.buildProjection(parsed.doc)
  const caps = capabilitiesOf(projection)

  // —— 画布组件的渲染后处理链（逐字复用，顺序与 use-canvas-selection 一致）——
  annotateNodeDataIds(host)
  caps.nodeAnnotator?.(projection)(host)
  caps.edgeAnnotator?.(projection)(host)
  addEdgeHitAreas(host)

  const resolver = caps.dataIdResolver(projection)
  const navigationIds = caps.navigationIds(projection)
  base.navigationIds = navigationIds
  base.declaresAddressable = navigationIds.length > 0 || caps.edgeAnnotator !== undefined

  // 可寻址性扫描：与 `selectionFromEventTarget` 同口径——候选是 `data-id` **或** DOM id
  // （mindmap 无 data-id，只认 DOM id 后缀 `node_N`），每个候选喂给该图种 resolver。
  const dataIdsInDom: string[] = []
  const resolved: string[] = []
  for (const el of Array.from(host.querySelectorAll('[data-id], [id]'))) {
    const dataId = el.getAttribute('data-id')
    if (dataId !== null && dataId !== '' && !dataIdsInDom.includes(dataId)) dataIdsInDom.push(dataId)
    for (const candidate of [dataId, el.getAttribute('id')]) {
      if (candidate === null || candidate === '') continue
      if (resolver(candidate) !== null && !resolved.includes(candidate)) resolved.push(candidate)
    }
  }
  base.dataIdsInDom = dataIdsInDom
  base.resolvedDataIds = resolved

  // 声明兑现：能力包给的 navigationIds 是否都能在 DOM 里定位（高亮同款谓词）
  const candidates = Array.from(host.querySelectorAll('[data-id], [id]'))
  base.missingNavigationIds = navigationIds.filter(
    (id) => !candidates.some((el) => matchesDataId(el, id)),
  )
  return base
}

async function run(): Promise<SmokeResult> {
  const status = document.getElementById('smoke-status')!
  const samples: SmokeSampleResult[] = []
  // 键序即语料声明序（GOLDEN_CORPUS 与注册表键一致，由单测钉住）
  for (const [type, entry] of Object.entries(GOLDEN_CORPUS)) {
    const sample = entry.samples[0]
    if (sample === undefined) continue
    const external = entry.external === true
    if (external) {
      // 外部图种（zenuml）：登记声明、不渲染（见文件头注释）
      samples.push({
        type,
        kind: sample.kind,
        description: sample.description,
        external: true,
        skipped: true,
        rendered: false,
        error: null,
        declaresAddressable: false,
        dataIdsInDom: [],
        resolvedDataIds: [],
        navigationIds: [],
        missingNavigationIds: [],
      })
      continue
    }
    status.textContent = `rendering ${type}…`
    samples.push(await smokeSample(type, sample, 0, false))
  }
  status.textContent = `done: ${samples.length} types`
  return { ok: samples.every((s) => s.skipped || (s.rendered && s.error === null)), samples }
}

window.__smoke = run()
