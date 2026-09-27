import type { ClassIntent, RelationKind, Visibility } from '../pipeline/class'
import { isValidClassName, RELATION_KINDS } from '../pipeline/class'

/**
 * class 表单值 → 编辑意图 的纯映射（工单 07）。
 * 本模块不做任何解析或落码：产出意图后由管线 applyEdit 执行。
 * 意图集合与语义见 src/lib/pipeline/class.ts。
 */

// ---------- 选项表（供表单控件与 i18n key 使用） ----------

export const RELATION_KIND_OPTIONS: RelationKind[] = RELATION_KINDS

export const VISIBILITY_OPTIONS: Visibility[] = ['', '+', '-', '#', '~']

// ---------- class 表单 → 意图 ----------

export interface AddClassForm {
  name: string
  generic: string
}

/** 新增类表单值 → add-class 意图；类名非法时返回 null */
export function addClassIntent(form: AddClassForm): ClassIntent | null {
  if (!isValidClassName(form.name)) return null
  return {
    type: 'add-class',
    name: form.name,
    generic: form.generic !== '' ? form.generic : undefined,
  }
}

export function renameClassIntent(name: string, newName: string): ClassIntent | null {
  if (!isValidClassName(newName) || newName === name) return null
  return { type: 'rename-class', name, newName }
}

export function setClassGenericIntent(name: string, generic: string): ClassIntent {
  return { type: 'set-class-generic', name, generic: generic !== '' ? generic : null }
}

export function deleteClassIntent(name: string): ClassIntent {
  return { type: 'delete-class', name }
}

// ---------- member 表单 → 意图 ----------

export interface AddMemberForm {
  className: string
  vis: Visibility
  text: string
}

/** 新增成员表单值 → add-member 意图；正文为空时返回 null */
export function addMemberIntent(form: AddMemberForm): ClassIntent | null {
  if (form.text.trim() === '') return null
  return { type: 'add-member', className: form.className, vis: form.vis, text: form.text.trim() }
}

export function setMemberIntent(elementId: string, form: { vis?: Visibility; text?: string }): ClassIntent {
  return { type: 'set-member', elementId, ...form }
}

export function deleteMemberIntent(elementId: string): ClassIntent {
  return { type: 'delete-member', elementId }
}

// ---------- relation 表单 → 意图 ----------

export interface AddRelationForm {
  from: string
  to: string
  kind: RelationKind
  cardFrom: string
  cardTo: string
  label: string
}

/** 新增关系表单值 → add-relation 意图；端点为空时返回 null */
export function addRelationIntent(form: AddRelationForm): ClassIntent | null {
  if (form.from === '' || form.to === '') return null
  return {
    type: 'add-relation',
    from: form.from,
    to: form.to,
    kind: form.kind,
    cardFrom: form.cardFrom !== '' ? form.cardFrom : undefined,
    cardTo: form.cardTo !== '' ? form.cardTo : undefined,
    label: form.label !== '' ? form.label : undefined,
  }
}

export function setRelationIntent(
  elementId: string,
  form: { kind?: RelationKind; cardFrom?: string | null; cardTo?: string | null; label?: string | null },
): ClassIntent {
  return { type: 'set-relation', elementId, ...form }
}

export function deleteRelationIntent(elementId: string): ClassIntent {
  return { type: 'delete-relation', elementId }
}

// ---------- note 表单 → 意图 ----------

export function addNoteIntent(form: { className: string | null; text: string }): ClassIntent | null {
  if (form.text.trim() === '') return null
  return {
    type: 'add-note',
    className: form.className !== null && form.className !== '' ? form.className : null,
    text: form.text.trim(),
  }
}

export function setNoteIntent(elementId: string, form: { className?: string | null; text?: string }): ClassIntent {
  return { type: 'set-note', elementId, ...form }
}

export function deleteNoteIntent(elementId: string): ClassIntent {
  return { type: 'delete-note', elementId }
}
