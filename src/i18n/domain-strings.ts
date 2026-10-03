import i18next from 'i18next'

/**
 * 领域层用户可见的默认命名（i18n-english 工单 07）。
 *
 * 为什么不用 i18next 字典：这些字符串产自 lib 层（menu-actions / *-keyboard / pipeline），
 * lib → i18n/index 会成环（index 反向 import 各图种菜单文件）；且纯 lib 测试不初始化 i18next，
 * 字典 t() 会拿不到文案。本模块是叶子：自带双语文案，语言读 i18next，未初始化回落中文。
 * 仅收「新建元素默认名」与「图表库默认命名」；解析器错误消息不对外展示，不在其列。
 */

export type NewElementKind =
  | 'node' | 'class' | 'participant' | 'entity' | 'column' | 'period' | 'section'
  | 'event' | 'card' | 'task' | 'sector' | 'point' | 'field' | 'leaf' | 'cause'
  | 'component' | 'anchor' | 'item' | 'directory' | 'file' | 'usecase'
  | 'systemBoundary' | 'flow' | 'element' | 'axis' | 'curve'

const ZH: Record<NewElementKind, string> = {
  node: '新节点', class: '新类', participant: '新参与者', entity: '新实体',
  column: '新列', period: '新阶段', section: '新分组', event: '新事件',
  card: '新卡片', task: '新任务', sector: '新扇区', point: '新点',
  field: '新字段', leaf: '新叶子', cause: '新原因', component: '新组件',
  anchor: '新锚点', item: '新条目', directory: '新目录', file: '新文件',
  usecase: '新用例', systemBoundary: '新系统边界', flow: '新流程',
  element: '新元素', axis: '新轴', curve: '新曲线',
}

const EN: Record<NewElementKind, string> = {
  node: 'New node', class: 'New class', participant: 'New participant', entity: 'New entity',
  column: 'New column', period: 'New period', section: 'New section', event: 'New event',
  card: 'New card', task: 'New task', sector: 'New sector', point: 'New point',
  field: 'New field', leaf: 'New leaf', cause: 'New cause', component: 'New component',
  anchor: 'New anchor', item: 'New item', directory: 'New directory', file: 'New file',
  usecase: 'New use case', systemBoundary: 'New system boundary', flow: 'New flow',
  element: 'New element', axis: 'New axis', curve: 'New curve',
}

function currentLanguage(): 'zh' | 'en' {
  return i18next.isInitialized && i18next.language === 'en' ? 'en' : 'zh'
}

/** 新建元素的默认显示名（menu-actions / 键盘添加 / 管线意图缺省共用） */
export function newElementName(kind: NewElementKind): string {
  return currentLanguage() === 'en' ? EN[kind] : ZH[kind]
}

/** 图表库默认图表名 */
export function unnamedDiagramName(): string {
  return currentLanguage() === 'en' ? 'Untitled diagram' : '未命名图表'
}

/** 复制图表的默认名 */
export function copyDiagramName(originName: string): string {
  return currentLanguage() === 'en' ? `${originName} copy` : `${originName} 副本`
}
