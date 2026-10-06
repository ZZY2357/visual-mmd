import { beforeEach, describe, expect, it } from 'vitest'
import { isDirty, useFileBindingStore } from '../file-binding'
import type { FsaFileHandle } from '../file-system-access'

/**
 * 本地文件绑定状态单测（self-grill-hardening 工单 18）。
 * 覆盖：绑定/恢复结果落位、写盘后清 dirty、解除绑定，以及 dirty 派生。
 */

const handle: FsaFileHandle = {
  kind: 'file',
  name: 'diagram.mmd',
  getFile: () => Promise.resolve(new File([''], 'diagram.mmd')),
  createWritable: () => Promise.reject(new Error('unused')),
}

describe('useFileBindingStore', () => {
  beforeEach(() => {
    useFileBindingStore.setState({ status: 'none', fileName: null, handle: null, lastSavedSource: null })
  })

  it('初始为未绑定', () => {
    const s = useFileBindingStore.getState()
    expect(s.status).toBe('none')
    expect(s.fileName).toBeNull()
  })

  it('bindFile 建立绑定并以磁盘文本为基准', () => {
    useFileBindingStore.getState().bindFile(handle, 'flowchart TD\n')
    const s = useFileBindingStore.getState()
    expect(s.status).toBe('ready')
    expect(s.fileName).toBe('diagram.mmd')
    expect(s.lastSavedSource).toBe('flowchart TD\n')
  })

  it('noteRestore 按结果置状态', () => {
    useFileBindingStore.getState().noteRestore({ kind: 'ready', handle, text: 'a\n' })
    expect(useFileBindingStore.getState().status).toBe('ready')
    useFileBindingStore.getState().noteRestore({ kind: 'needs-permission', handle })
    expect(useFileBindingStore.getState().status).toBe('needs-permission')
    useFileBindingStore.getState().noteRestore({ kind: 'denied', handle })
    expect(useFileBindingStore.getState().status).toBe('denied')
    useFileBindingStore.getState().noteRestore({ kind: 'error', handle, error: new Error('x') })
    expect(useFileBindingStore.getState().status).toBe('error')
    useFileBindingStore.getState().noteRestore({ kind: 'none' })
    // none 不改变已有绑定
    expect(useFileBindingStore.getState().status).toBe('error')
  })

  it('markSaved 更新基准（清 dirty）', () => {
    useFileBindingStore.getState().bindFile(handle, 'old\n')
    useFileBindingStore.getState().markSaved('new\n')
    expect(useFileBindingStore.getState().lastSavedSource).toBe('new\n')
    expect(useFileBindingStore.getState().status).toBe('ready')
  })

  it('unbind 清空全部', () => {
    useFileBindingStore.getState().bindFile(handle, 'x\n')
    useFileBindingStore.getState().unbind()
    expect(useFileBindingStore.getState()).toMatchObject({
      status: 'none',
      fileName: null,
      handle: null,
      lastSavedSource: null,
    })
  })
})

describe('isDirty', () => {
  it('未绑定 → 不算 dirty', () => {
    expect(isDirty({ handle: null, lastSavedSource: null }, 'x')).toBe(false)
  })

  it('已绑定且源码与基准不同 → dirty', () => {
    expect(isDirty({ handle, lastSavedSource: 'a\n' }, 'b\n')).toBe(true)
  })

  it('已绑定且源码与基准相同 → 不 dirty', () => {
    expect(isDirty({ handle, lastSavedSource: 'a\n' }, 'a\n')).toBe(false)
  })
})
