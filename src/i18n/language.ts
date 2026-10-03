/**
 * 应用界面语言偏好（i18n-english 工单 01）。
 * 语言是应用级偏好而非编辑器状态，独立于 editor store：
 * - localStorage 键沿用 `visual-mmd:` 前缀
 * - 首次启动（无已保存偏好）跟随浏览器语言
 */

export type AppLanguage = 'zh' | 'en'

export const LANGUAGE_STORAGE_KEY = 'visual-mmd:language'

const LANGUAGES: readonly AppLanguage[] = ['zh', 'en']

function isAppLanguage(value: string): value is AppLanguage {
  return (LANGUAGES as readonly string[]).includes(value)
}

/** 已保存偏好优先；无效/缺失时跟随浏览器（zh 前缀 → 中文，否则英文）。
 * storage 为 null/undefined（部分测试环境不可用）时视同无偏好。 */
export function resolveInitialLanguage(saved: string | null, navigatorLanguage: string): AppLanguage {
  if (saved !== null && isAppLanguage(saved)) return saved
  return navigatorLanguage.startsWith('zh') ? 'zh' : 'en'
}

export function loadSavedLanguage(storage?: Storage | null): AppLanguage | null {
  const raw = storage?.getItem(LANGUAGE_STORAGE_KEY)
  return typeof raw === 'string' && isAppLanguage(raw) ? raw : null
}

export function persistLanguage(language: AppLanguage, storage?: Storage | null): void {
  storage?.setItem(LANGUAGE_STORAGE_KEY, language)
}
