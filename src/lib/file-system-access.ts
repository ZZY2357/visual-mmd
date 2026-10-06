/**
 * File System Access API 直接打开/保存 .mmd（self-grill-hardening 工单 18）的纯逻辑接缝。
 *
 * 设计要点：
 * - **可注入**：不直接引用 `window.showOpenFilePicker` 等全局；调用方把「picker 表面」
 *   （`FsaPicker`）传进来。happy-dom 没有真实 FSA，测试用替身驱动全部路径。
 * - **句柄持久化**：`FileSystemFileHandle` 不是 JSON 可序列化的，但 IndexedDB 的结构化克隆
 *   可以原样存它。`HandleStore` 抽象存取；IndexedDB 实现全程 guarded——happy-dom 无
 *   `indexedDB` 时退化为 no-op（返回 null），应用照常启动。
 * - **失败模式**：用户取消 picker = `cancelled`（no-op，不报错）；恢复时权限被拒 =
 *   `denied`（调用方降级为只读/重新授权）；不支持 FSA = `unsupported`（调用方回退到
 *   既有的 `<input type=file>` 导入 / 下载导出，工单 10）。
 *
 * 写盘内容即当前源码**逐字**写入（ADR-0008 单一真相源，与 .mmd 导出的逐字承诺一致）。
 */

/** 权限状态（与浏览器 PermissionState 对齐；'unsupported' 表示句柄未暴露权限 API） */
export type FsaPermission = 'granted' | 'prompt' | 'denied' | 'unsupported'

/** 句柄的权限查询/请求描述符（现代 Chrome 把它放在 FileSystemHandle 上） */
export interface FsaPermissionDescriptor {
  mode: 'read' | 'readwrite'
}

/** 可写流（FileSystemWritableFileStream 的结构子集） */
export interface FsaWritable {
  write(data: string | Blob | ArrayBuffer | ArrayBufferView): Promise<void>
  close(): Promise<void>
  abort?(): Promise<void>
}

/**
 * 文件句柄的结构子集（FileSystemFileHandle 的鸭子类型）。
 * 真实浏览器句柄可直接赋给本类型；测试用最小替身即可。
 */
export interface FsaFileHandle {
  readonly kind: 'file'
  readonly name: string
  getFile(): Promise<File>
  createWritable(options?: { keepExistingData?: boolean }): Promise<FsaWritable>
  /** 现代 Chrome 提供；老实现可能缺失（缺失时按 granted 乐观处理） */
  queryPermission?(descriptor?: FsaPermissionDescriptor): Promise<PermissionState>
  requestPermission?(descriptor?: FsaPermissionDescriptor): Promise<PermissionState>
}

/** 文件类型过滤（.mmd 是纯文本） */
export interface FsaFileType {
  description: string
  accept: Record<string, string[]>
}

/** picker 表面：测试注入替身；生产从全局解析 */
export interface FsaPicker {
  showOpenFilePicker(options?: {
    multiple?: boolean
    types?: FsaFileType[]
    excludeAcceptAllOption?: boolean
  }): Promise<FsaFileHandle[]>
  showSaveFilePicker(options?: {
    suggestedName?: string
    types?: FsaFileType[]
    excludeAcceptAllOption?: boolean
  }): Promise<FsaFileHandle>
}

/** .mmd 打开/保存的类型过滤 */
export const MMD_FILE_TYPES: FsaFileType[] = [
  { description: 'Mermaid', accept: { 'text/plain': ['.mmd'] } },
]

/** 从给定作用域解析 picker；缺少任一函数即视为不支持（返回 null，不抛） */
export function resolvePicker(scope: unknown = globalThis): FsaPicker | null {
  if (scope === null || typeof scope !== 'object') return null
  const s = scope as Record<string, unknown>
  if (typeof s.showOpenFilePicker !== 'function' || typeof s.showSaveFilePicker !== 'function') {
    return null
  }
  return {
    showOpenFilePicker: s.showOpenFilePicker.bind(scope) as FsaPicker['showOpenFilePicker'],
    showSaveFilePicker: s.showSaveFilePicker.bind(scope) as FsaPicker['showSaveFilePicker'],
  }
}

/** 当前环境是否支持 FSA（两个 picker 都在才可用） */
export function supportsFileSystemAccess(scope: unknown = globalThis): boolean {
  return resolvePicker(scope) !== null
}

/** 用户取消 picker 的判定：AbortError（DOMException 或同名普通对象） */
export function isAbortError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  return (error as { name?: unknown }).name === 'AbortError'
}

// ---- 读 ----

/** 打开结果 */
export type OpenFileOutcome =
  | { kind: 'opened'; handle: FsaFileHandle; text: string }
  | { kind: 'cancelled' }
  | { kind: 'unsupported' }
  | { kind: 'error'; error: unknown }

/** 弹出打开对话框并把选中的 .mmd 读成文本。picker 为 null → unsupported；取消 → cancelled */
export async function pickAndReadFile(picker: FsaPicker | null): Promise<OpenFileOutcome> {
  if (picker === null) return { kind: 'unsupported' }
  let handle: FsaFileHandle
  try {
    const handles = await picker.showOpenFilePicker({
      multiple: false,
      types: MMD_FILE_TYPES,
      excludeAcceptAllOption: false,
    })
    const first = handles[0]
    if (first === undefined) return { kind: 'cancelled' }
    handle = first
  } catch (error) {
    if (isAbortError(error)) return { kind: 'cancelled' }
    return { kind: 'error', error }
  }
  try {
    const text = await readHandleText(handle)
    return { kind: 'opened', handle, text }
  } catch (error) {
    return { kind: 'error', error }
  }
}

/** 读取句柄指向文件的文本（getFile().text()） */
export async function readHandleText(handle: FsaFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

// ---- 权限 ----

/** 查询句柄权限；句柄未暴露权限 API 时按 granted 乐观处理 */
export async function checkPermission(
  handle: FsaFileHandle,
  mode: FsaPermissionDescriptor['mode'] = 'readwrite',
): Promise<FsaPermission> {
  if (typeof handle.queryPermission !== 'function') return 'granted'
  try {
    return await handle.queryPermission({ mode })
  } catch {
    return 'unsupported'
  }
}

/**
 * 确保句柄权限：query → 若为 prompt 且允许请求则 request。
 * 请求需用户手势（真实浏览器），无手势时会拒绝或抛错——统一降级为 'prompt'。
 */
export async function ensurePermission(
  handle: FsaFileHandle,
  mode: FsaPermissionDescriptor['mode'] = 'readwrite',
  request = true,
): Promise<FsaPermission> {
  const current = await checkPermission(handle, mode)
  if (current === 'granted' || current === 'denied' || current === 'unsupported') return current
  if (!request || typeof handle.requestPermission !== 'function') return current
  try {
    return await handle.requestPermission({ mode })
  } catch {
    return 'prompt'
  }
}

// ---- 写 ----

/** 保存结果 */
export type SaveOutcome =
  | { kind: 'saved'; handle: FsaFileHandle }
  | { kind: 'cancelled' }
  | { kind: 'denied' }
  | { kind: 'unsupported' }
  | { kind: 'error'; error: unknown }

/**
 * 把源码**逐字**写入既有句柄（不弹 picker）。
 * 写前确保 readwrite 权限：被拒 → denied；权限请求需用户手势，由调用方在点击处理器里触发。
 */
export async function writeToHandle(handle: FsaFileHandle, source: string): Promise<SaveOutcome> {
  const permission = await ensurePermission(handle, 'readwrite', true)
  if (permission === 'denied') return { kind: 'denied' }
  if (permission === 'prompt') return { kind: 'denied' }
  let writable: FsaWritable
  try {
    writable = await handle.createWritable()
  } catch (error) {
    return { kind: 'error', error }
  }
  try {
    await writable.write(source)
    await writable.close()
    return { kind: 'saved', handle }
  } catch (error) {
    try {
      await writable.abort?.()
    } catch {
      // abort 失败不影响结果上报
    }
    return { kind: 'error', error }
  }
}

/** 弹出保存对话框并写入（无既有句柄时的「保存」= 选择落点） */
export async function pickAndWriteFile(
  picker: FsaPicker | null,
  source: string,
  suggestedName: string,
): Promise<SaveOutcome> {
  if (picker === null) return { kind: 'unsupported' }
  let handle: FsaFileHandle
  try {
    handle = await picker.showSaveFilePicker({
      suggestedName,
      types: MMD_FILE_TYPES,
      excludeAcceptAllOption: false,
    })
  } catch (error) {
    if (isAbortError(error)) return { kind: 'cancelled' }
    return { kind: 'error', error }
  }
  return writeToHandle(handle, source)
}

// ---- 句柄持久化 ----

/** 上次打开文件的句柄存取接缝 */
export interface HandleStore {
  get(): Promise<FsaFileHandle | null>
  set(handle: FsaFileHandle | null): Promise<void>
}

/** 内存实现（测试 / IndexedDB 不可用时的降级） */
export function createMemoryHandleStore(): HandleStore {
  let current: FsaFileHandle | null = null
  return {
    get: () => Promise.resolve(current),
    set: (handle) => {
      current = handle
      return Promise.resolve()
    },
  }
}

/** 无操作实现：任何环境都安全（不持久化） */
export function createNoopHandleStore(): HandleStore {
  return {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
  }
}

const DB_NAME = 'visual-mmd-files'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'last-mmd-file'

/** 安全取得 IndexedDB 工厂：缺失或访问抛错时返回 null（不崩） */
export function resolveIndexedDb(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB
  } catch {
    return null
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(DB_NAME, 1)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    let request: IDBRequest<T>
    let tx: IDBTransaction
    try {
      tx = db.transaction(STORE_NAME, mode)
      request = run(tx.objectStore(STORE_NAME))
    } catch {
      resolve(null)
      return
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    tx.onabort = () => resolve(null)
  })
}

/**
 * IndexedDB 句柄存储：结构化克隆可原样保存 FileSystemFileHandle。
 * 任一环节失败（无 IDB、被禁用、事务异常）都返回 null / 静默失败——持久化是增强而非必需。
 */
export function createIndexedDbHandleStore(factory: IDBFactory | null = resolveIndexedDb()): HandleStore {
  if (factory === null) return createNoopHandleStore()
  return {
    async get() {
      const db = await openDatabase(factory)
      if (db === null) return null
      const value = await runTransaction<unknown>(db, 'readonly', (store) => store.get(HANDLE_KEY))
      db.close()
      return isFileHandle(value) ? value : null
    },
    async set(handle) {
      const db = await openDatabase(factory)
      if (db === null) return
      if (handle === null) {
        await runTransaction(db, 'readwrite', (store) => store.delete(HANDLE_KEY))
      } else {
        await runTransaction(db, 'readwrite', (store) => store.put(handle, HANDLE_KEY))
      }
      db.close()
    },
  }
}

/** 默认句柄存储：有 IndexedDB 用之，否则 no-op（happy-dom / 隐私模式安全） */
export function defaultHandleStore(): HandleStore {
  return createIndexedDbHandleStore(resolveIndexedDb())
}

/** 结构校验：至少具备 kind=file、name、getFile、createWritable */
function isFileHandle(value: unknown): value is FsaFileHandle {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.kind === 'file' &&
    typeof v.name === 'string' &&
    typeof v.getFile === 'function' &&
    typeof v.createWritable === 'function'
  )
}

// ---- 跨会话恢复 ----

/** 恢复结果 */
export type RestoreOutcome =
  | { kind: 'none' }
  | { kind: 'ready'; handle: FsaFileHandle; text: string }
  | { kind: 'needs-permission'; handle: FsaFileHandle }
  | { kind: 'denied'; handle: FsaFileHandle }
  | { kind: 'error'; handle: FsaFileHandle; error: unknown }

/**
 * 跨会话恢复上次打开的文件：从存储取句柄 → 确保权限（默认尝试请求）→ 读回文本。
 * - 无存储句柄 → none
 * - 权限 prompt/denied → 对应结果（调用方提示「重新连接」/ 降级）
 * - 读文件失败 → error（句柄仍返回，供用户重试或另存）
 *
 * `requestPermission` 默认 true（工单要求「恢复时请求权限」）；真实浏览器中请求需用户手势，
 * 无手势时 ensurePermission 会降级为 prompt，调用方再以按钮手势重试。
 */
export async function restoreBoundFile(
  store: HandleStore,
  requestPermission = true,
): Promise<RestoreOutcome> {
  const handle = await store.get()
  if (handle === null) return { kind: 'none' }
  return reconnectHandle(handle, requestPermission)
}

/**
 * 对给定句柄重新走权限流程并读回文本（恢复与「重新连接」共用）。
 * 句柄已在内存时无需经存储——重新连接直接用当前句柄。
 */
export async function reconnectHandle(
  handle: FsaFileHandle,
  requestPermission = true,
): Promise<RestoreOutcome> {
  const permission = await ensurePermission(handle, 'readwrite', requestPermission)
  if (permission === 'denied') return { kind: 'denied', handle }
  if (permission === 'prompt') return { kind: 'needs-permission', handle }
  try {
    const text = await readHandleText(handle)
    return { kind: 'ready', handle, text }
  } catch (error) {
    return { kind: 'error', handle, error }
  }
}
