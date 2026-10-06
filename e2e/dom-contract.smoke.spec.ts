import { test, expect } from '@playwright/test'

/** 夹具 window.__smoke 的返回形状（与 e2e/harness/main.ts 对齐；spec 独立声明，
 * 不依赖夹具模块的全局增强——两者由 Playwright 各自转译，不做跨文件类型检查）。 */
interface SmokeSample {
  type: string
  skipped: boolean
  rendered: boolean
  error: string | null
  declaresAddressable: boolean
  resolvedDataIds: string[]
  navigationIds: string[]
  missingNavigationIds: string[]
}

declare global {
  interface Window {
    __smoke?: Promise<{ ok: boolean; samples: SmokeSample[] }>
  }
}

/**
 * DOM 契约冒烟（ticket 08）。
 *
 * 唯一目的：钉住「mermaid 渲染产物上的 data-id 可寻址」这条本仓锚在 mermaid
 * **非公开 API** 上的契约——mermaid 升级时全项目这里最先亮红灯。
 *
 * 断言口径（与夹具 window.__smoke 的结果一一对应）：
 * 1. 覆盖全部 31 种已注册图种（金样语料的键即注册表键）；
 * 2. 除 zenuml（外部渲染器，按设计跳过）外，每种图都能渲染且无错误；
 * 3. **能力声明兑现**：能力包声明可寻址的图种（navigationIds 非空或实现反注），
 *    其声明的节点 id 必须都能在 DOM 中定位（missingNavigationIds 为空），
 *    且渲染产物里至少有一个 data-id 能被该图种 resolver 认领；
 * 4. **不虚报可寻址**：能力包未声明可寻址的图种，DOM 中不允许有能被 resolver
 *    认领的 data-id（resolver 是永不命中的空实现——如实降级）。
 *
 * 这是本仓登记在案的浏览器测试例外（AGENTS.md「默认不做浏览器测试」），授权见工单原文。
 */
test('DOM 契约冒烟：全部图种渲染后可寻址', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => consoleErrors.push(String(err)))

  await page.goto('/e2e/harness/index.html')
  const result = await page.evaluate(() => window.__smoke)

  expect(result, '夹具未挂载 window.__smoke').toBeTruthy()
  const samples = result!.samples
  const ids = samples.map((s) => s.type)

  // 1. 覆盖全部图种（31）
  expect(samples.length, `图种数：${ids.join(', ')}`).toBe(31)
  expect(new Set(ids).size).toBe(31)

  // 2. 渲染成功（zenuml 跳过）
  const failed = samples.filter((s) => !s.skipped && (!s.rendered || s.error !== null))
  expect(
    failed.map((s) => `${s.type}: ${s.error ?? '未渲染'}`),
    '有图种渲染失败',
  ).toEqual([])

  // 3. 声明兑现
  const addressable = samples.filter((s) => s.declaresAddressable)
  expect(addressable.length, '没有任何图种声明可寻址——夹具可能空转').toBeGreaterThan(0)
  for (const s of addressable) {
    expect(s.missingNavigationIds, `${s.type} 声明的 navigationIds 在 DOM 中缺失`).toEqual([])
    expect(
      s.resolvedDataIds.length,
      `${s.type} 声明可寻址，但 DOM 里没有可被 resolver 认领的 data-id`,
    ).toBeGreaterThan(0)
  }

  // 4. 不虚报可寻址
  const nonAddressable = samples.filter((s) => !s.declaresAddressable && !s.skipped)
  for (const s of nonAddressable) {
    expect(
      s.resolvedDataIds,
      `${s.type} 未声明可寻址，却解析出了 data-id`,
    ).toEqual([])
  }

  expect(consoleErrors, '页面有未捕获错误').toEqual([])
})
