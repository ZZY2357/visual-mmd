import { describe, expect, it, vi } from 'vitest'
import {
  MMD_FILE_TYPES,
  checkPermission,
  createIndexedDbHandleStore,
  createMemoryHandleStore,
  createNoopHandleStore,
  defaultHandleStore,
  ensurePermission,
  isAbortError,
  pickAndReadFile,
  pickAndWriteFile,
  readHandleText,
  reconnectHandle,
  resolveIndexedDb,
  resolvePicker,
  restoreBoundFile,
  supportsFileSystemAccess,
  writeToHandle,
  type FsaFileHandle,
  type FsaPicker,
  type FsaWritable,
} from '../file-system-access'

/**
 * File System Access API 接缝单测（self-grill-hardening 工单 18）。
 *
 * happy-dom 没有真实 FSA / IndexedDB，故全部路径经**注入替身**驱动：
 * - picker 替身模拟打开/保存对话框与取消（AbortError）
 * - 句柄替身模拟权限查询/请求与可写流
 * - 句柄存储用内存替身
 * 真实 picker 无法在此环境执行，故不在单测覆盖范围（真机手工验证）。
 */

function abortError(): Error {
  const err = new Error('user aborted')
  err.name = 'AbortError'
  return err
}

interface HandleOptions {
  name?: string
  content?: string
  query?: PermissionState | 'throw' | 'missing'
  request?: PermissionState | 'throw'
  writeError?: Error
}

function makeHandle(options: HandleOptions = {}) {
  const {
    name = 'diagram.mmd',
    content = 'flowchart TD\n',
    query = 'granted',
    request = 'granted',
    writeError,
  } = options
  const written: string[] = []
  const writable: FsaWritable = {
    write: (data) => {
      if (writeError !== undefined) return Promise.reject(writeError)
      // 本替身只服务字符串写入（writeToHandle 恒传源码字符串）；其余类型明确拒绝，
      // 避免 String(data) 对 Blob/ArrayBuffer 产出 [object Object] 式的假绿。
      if (typeof data !== 'string') return Promise.reject(new Error('test writable only accepts strings'))
      written.push(data)
      return Promise.resolve()
    },
    close: () => Promise.resolve(),
    abort: () => Promise.resolve(),
  }
  const handle = {
    kind: 'file' as const,
    name,
    getFile: () => Promise.resolve(new File([content], name, { type: 'text/plain' })),
    createWritable: () => Promise.resolve(writable),
    ...(query === 'missing'
      ? {}
      : {
          queryPermission: () => {
            if (query === 'throw') return Promise.reject(new Error('boom'))
            return Promise.resolve(query)
          },
        }),
    ...(query === 'missing'
      ? {}
      : {
          requestPermission: () => {
            if (request === 'throw') return Promise.reject(new Error('boom'))
            return Promise.resolve(request)
          },
        }),
  } satisfies FsaFileHandle
  return { handle, written }
}

describe('resolvePicker / supportsFileSystemAccess', () => {
  it('两个 picker 都在时解析成功', () => {
    const scope = { showOpenFilePicker: vi.fn(), showSaveFilePicker: vi.fn() }
    expect(supportsFileSystemAccess(scope)).toBe(true)
    expect(resolvePicker(scope)).not.toBeNull()
  })

  it('缺少任一 picker 时不支持', () => {
    expect(supportsFileSystemAccess({ showOpenFilePicker: vi.fn() })).toBe(false)
    expect(resolvePicker({})).toBeNull()
    expect(resolvePicker(null)).toBeNull()
    expect(supportsFileSystemAccess(undefined)).toBe(false)
  })

  it('绑定到传入作用域（this 正确）', async () => {
    const scope = {
      marker: 'scope',
      showOpenFilePicker: function (this: { marker: string }) {
        return Promise.resolve([{ marker: this.marker }])
      },
      showSaveFilePicker: vi.fn(),
    }
    const picker = resolvePicker(scope)
    const handles = await picker!.showOpenFilePicker()
    expect(handles[0]).toEqual({ marker: 'scope' })
  })
})

describe('isAbortError', () => {
  it('识别 AbortError（DOMException 与普通对象）', () => {
    expect(isAbortError(abortError())).toBe(true)
    expect(isAbortError({ name: 'AbortError' })).toBe(true)
    expect(isAbortError(new Error('other'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
  })
})

describe('pickAndReadFile', () => {
  it('选中文件后读回文本', async () => {
    const { handle } = makeHandle({ content: 'sequenceDiagram\n' })
    const picker: FsaPicker = {
      showOpenFilePicker: () => Promise.resolve([handle]),
      showSaveFilePicker: vi.fn(),
    }
    const outcome = await pickAndReadFile(picker)
    expect(outcome).toEqual({ kind: 'opened', handle, text: 'sequenceDiagram\n' })
  })

  it('picker 为 null → unsupported（优雅回退）', async () => {
    expect(await pickAndReadFile(null)).toEqual({ kind: 'unsupported' })
  })

  it('用户取消（AbortError）→ cancelled，不报错', async () => {
    const picker: FsaPicker = {
      showOpenFilePicker: () => Promise.reject(abortError()),
      showSaveFilePicker: vi.fn(),
    }
    expect(await pickAndReadFile(picker)).toEqual({ kind: 'cancelled' })
  })

  it('空选择 → cancelled', async () => {
    const picker: FsaPicker = {
      showOpenFilePicker: () => Promise.resolve([]),
      showSaveFilePicker: vi.fn(),
    }
    expect(await pickAndReadFile(picker)).toEqual({ kind: 'cancelled' })
  })

  it('其他错误 → error', async () => {
    const picker: FsaPicker = {
      showOpenFilePicker: () => Promise.reject(new Error('boom')),
      showSaveFilePicker: vi.fn(),
    }
    const outcome = await pickAndReadFile(picker)
    expect(outcome.kind).toBe('error')
  })

  it('传入了 .mmd 类型过滤', async () => {
    const showOpenFilePicker = vi.fn().mockResolvedValue([])
    await pickAndReadFile({ showOpenFilePicker, showSaveFilePicker: vi.fn() })
    expect(showOpenFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, types: MMD_FILE_TYPES }),
    )
  })
})

describe('readHandleText', () => {
  it('经 getFile().text() 读取', async () => {
    const { handle } = makeHandle({ content: 'classDiagram\n' })
    expect(await readHandleText(handle)).toBe('classDiagram\n')
  })
})

describe('checkPermission / ensurePermission', () => {
  it('句柄未暴露权限 API → granted（乐观）', async () => {
    const { handle } = makeHandle({ query: 'missing' })
    expect(await checkPermission(handle)).toBe('granted')
  })

  it('查询抛错 → unsupported', async () => {
    const { handle } = makeHandle({ query: 'throw' })
    expect(await checkPermission(handle)).toBe('unsupported')
  })

  it('prompt 时请求权限，返回结果', async () => {
    const { handle } = makeHandle({ query: 'prompt', request: 'granted' })
    expect(await ensurePermission(handle, 'readwrite', true)).toBe('granted')
  })

  it('requestPermission=false 时保留 prompt', async () => {
    const { handle } = makeHandle({ query: 'prompt', request: 'granted' })
    expect(await ensurePermission(handle, 'readwrite', false)).toBe('prompt')
  })

  it('请求抛错 → 降级为 prompt', async () => {
    const { handle } = makeHandle({ query: 'prompt', request: 'throw' })
    expect(await ensurePermission(handle, 'readwrite', true)).toBe('prompt')
  })

  it('denied 直接返回，不再请求', async () => {
    const { handle } = makeHandle({ query: 'denied' })
    expect(await ensurePermission(handle)).toBe('denied')
  })
})

describe('writeToHandle（逐字写盘）', () => {
  it('把源码逐字写入并关闭', async () => {
    const { handle, written } = makeHandle()
    const outcome = await writeToHandle(handle, 'flowchart TD\n    A --> B\n')
    expect(outcome).toEqual({ kind: 'saved', handle })
    expect(written).toEqual(['flowchart TD\n    A --> B\n'])
  })

  it('权限被拒 → denied，不写', async () => {
    const { handle, written } = makeHandle({ query: 'denied' })
    expect(await writeToHandle(handle, 'x')).toEqual({ kind: 'denied' })
    expect(written).toEqual([])
  })

  it('权限仅 prompt（无手势）→ denied，不写', async () => {
    const { handle, written } = makeHandle({ query: 'prompt', request: 'prompt' })
    expect(await writeToHandle(handle, 'x')).toEqual({ kind: 'denied' })
    expect(written).toEqual([])
  })

  it('写入失败 → error 并 abort', async () => {
    const { handle } = makeHandle({ writeError: new Error('disk full') })
    const outcome = await writeToHandle(handle, 'x')
    expect(outcome.kind).toBe('error')
  })
})

describe('pickAndWriteFile', () => {
  it('保存对话框后写入', async () => {
    const { handle, written } = makeHandle()
    const picker: FsaPicker = {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: () => Promise.resolve(handle),
    }
    const outcome = await pickAndWriteFile(picker, 'pie\n', '流程图.mmd')
    expect(outcome).toEqual({ kind: 'saved', handle })
    expect(written).toEqual(['pie\n'])
  })

  it('picker 为 null → unsupported', async () => {
    expect(await pickAndWriteFile(null, 'x', 'a.mmd')).toEqual({ kind: 'unsupported' })
  })

  it('取消保存 → cancelled', async () => {
    const picker: FsaPicker = {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: () => Promise.reject(abortError()),
    }
    expect(await pickAndWriteFile(picker, 'x', 'a.mmd')).toEqual({ kind: 'cancelled' })
  })
})

describe('句柄存储', () => {
  it('内存实现可存取', async () => {
    const store = createMemoryHandleStore()
    const { handle } = makeHandle()
    expect(await store.get()).toBeNull()
    await store.set(handle)
    expect(await store.get()).toBe(handle)
    await store.set(null)
    expect(await store.get()).toBeNull()
  })

  it('noop 实现永远返回 null 且 set 不抛', async () => {
    const store = createNoopHandleStore()
    await store.set(makeHandle().handle)
    expect(await store.get()).toBeNull()
  })

  it('resolveIndexedDb：happy-dom 无 indexedDB → null（不崩）', () => {
    expect(resolveIndexedDb()).toBeNull()
  })

  it('IndexedDB 不可用时 defaultHandleStore 降级为 no-op', async () => {
    const store = defaultHandleStore()
    await expect(store.get()).resolves.toBeNull()
    await expect(store.set(makeHandle().handle)).resolves.toBeUndefined()
  })

  it('createIndexedDbHandleStore(null) 即 no-op', async () => {
    const store = createIndexedDbHandleStore(null)
    await store.set(makeHandle().handle)
    expect(await store.get()).toBeNull()
  })
})

describe('restoreBoundFile / reconnectHandle', () => {
  it('无存储句柄 → none', async () => {
    expect(await restoreBoundFile(createNoopHandleStore())).toEqual({ kind: 'none' })
  })

  it('权限 granted → ready 并读回文本', async () => {
    const { handle } = makeHandle({ content: 'mindmap\n' })
    const store = createMemoryHandleStore()
    await store.set(handle)
    const outcome = await restoreBoundFile(store)
    expect(outcome).toEqual({ kind: 'ready', handle, text: 'mindmap\n' })
  })

  it('权限 prompt 且不请求 → needs-permission（句柄保留）', async () => {
    const { handle } = makeHandle({ query: 'prompt', request: 'prompt' })
    const store = createMemoryHandleStore()
    await store.set(handle)
    expect(await restoreBoundFile(store, false)).toEqual({ kind: 'needs-permission', handle })
  })

  it('权限 denied → denied', async () => {
    const { handle } = makeHandle({ query: 'denied' })
    const store = createMemoryHandleStore()
    await store.set(handle)
    expect(await restoreBoundFile(store)).toEqual({ kind: 'denied', handle })
  })

  it('读文件失败 → error（句柄保留）', async () => {
    const { handle } = makeHandle()
    const broken: FsaFileHandle = { ...handle, getFile: () => Promise.reject(new Error('gone')) }
    expect(await reconnectHandle(broken)).toEqual({ kind: 'error', handle: broken, error: expect.any(Error) as unknown })
  })

  it('reconnectHandle 请求权限后可 ready', async () => {
    const { handle } = makeHandle({ query: 'prompt', request: 'granted', content: 'state\n' })
    const outcome = await reconnectHandle(handle, true)
    expect(outcome).toEqual({ kind: 'ready', handle, text: 'state\n' })
  })
})
