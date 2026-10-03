import { beforeAll, describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { initI18n, setAppLanguage } from '../index'

/**
 * i18n-english 工单 05：第一批表单（flowchart / sequence / class / mindmap / state /
 * er / gantt / pie）用到的键与枚举组在英文下必须是英文。
 */

const FORM_KEYS = [
  // 树分区标题
  'participants', 'messages', 'notes', 'blocks', 'regions', 'rectRegion', 'boxRegion',
  'states', 'stateTransitions', 'stateComposite', 'classes', 'members', 'relations',
  'namespaces', 'erEntities', 'erAttributes', 'erRelations',
  'ganttDirectives', 'ganttSections', 'ganttTasks', 'pieSectors',
  // flowchart
  'nodeId', 'invalidId', 'nodeShape', 'deleteNode', 'edgeFrom', 'edgeTo', 'edgeLineStyle',
  'edgeArrow', 'edgeBidirectional', 'edgeLength', 'edgeLabelField', 'edgeLabelPlaceholder',
  'deleteEdge', 'subgraphTitle', 'deleteSubgraph', 'classDefName', 'styleFill', 'styleStroke',
  'styleDash', 'styleColor', 'deleteClassDef', 'applyStyles', 'applyStylesEmpty',
  'addEdgeFrom', 'addEdgeTo', 'directionInvalid',
  // sequence
  'autonumber', 'autonumberStart', 'autonumberStep', 'autonumberInvalid', 'actorType',
  'participantType', 'lifelineActive', 'createdByCreate', 'participantAlias', 'participantId',
  'invalidParticipantId', 'activateLifeline', 'deactivateLifeline', 'deleteParticipant',
  'messageArrow', 'messageAct', 'actNone', 'actActivate', 'actDeactivate', 'messageText',
  'deleteMessage', 'noteUnknownActors', 'noteActors', 'notePosition', 'noteText', 'deleteNote',
  'blockLabel', 'addElse', 'addAnd', 'elseBranch', 'andBranch', 'deleteBlock', 'rectColor',
  'boxLabel', 'addNoteActorA', 'addNoteActorB', 'addBlockKeyword', 'addNoteTarget',
  // class
  'classType', 'className', 'invalidClassName', 'classGeneric', 'deleteClass',
  'memberVisibility', 'memberText', 'memberOwner', 'blockMember', 'deleteMember',
  'relationKind', 'relationFromGeneric', 'relationToGeneric', 'cardFrom', 'cardTo',
  'relationLabel', 'deleteRelation', 'floatingNote', 'noteFor', 'namespaceName',
  'invalidNamespaceName',
  // mindmap
  'addChild', 'addSibling', 'deleteMindmapNode', 'mindmapNodeIcon', 'mindmapIconHint',
  'mindmapAddText', 'mindmapNodeIdHint', 'mindmapInvalidNodeId',
  // state
  'stateId', 'stateDesc', 'deleteState', 'transitionLabel', 'deleteTransition',
  'stateNoteTarget', 'addStateFrom', 'addStateTo',
  // er
  'erEntityName', 'erAlias', 'deleteErEntity', 'erAttrOwner', 'erAttrType', 'erAttrName',
  'erKeyPk', 'erKeyFk', 'erKeyUk', 'erAttrNullable', 'erAttrComment', 'deleteErAttribute',
  'erCardLeft', 'erCardRight', 'erLineType', 'erRelationLabel', 'deleteErRelation',
  'erFrom', 'erTo',
  // gantt
  'ganttDateFormat', 'ganttNoDateFormat', 'ganttDirectiveValue', 'ganttTodayMarkerOff',
  'ganttTaskName', 'ganttTaskTags', 'ganttTaskShape', 'ganttShapeDateEnd',
  'ganttShapeDateDuration', 'ganttShapeAfterEnd', 'ganttShapeDateUntil', 'ganttShapeAfterUntil',
  'ganttTaskId', 'ganttTaskIdPlaceholder', 'ganttTaskStart', 'ganttTaskEnd', 'ganttTaskDuration',
  'ganttTaskAfterIds', 'ganttTaskUntilId', 'ganttMetaOtherHint', 'invalidGanttTaskName',
  'invalidGanttSectionName', 'invalidGanttTitle', 'invalidGanttDirectiveValue',
  'invalidGanttMeta', 'deleteGanttTask', 'deleteGanttSection', 'ganttSectionName', 'ganttTitle',
  // pie
  'pieTitle', 'pieLabel', 'pieValue', 'pieValueInvalidShort', 'deletePieSector',
  'invalidPieLabel', 'invalidPieValue', 'invalidPieTitle',
].map((k) => `propertyPanel.${k}`)

const ENUM_KEYS = [
  ...['->>', '-->', '-x', '--'].map((v) => `seqArrows.${v}`),
  ...['over', 'left', 'right'].map((v) => `notePos.${v}`),
  ...['loop', 'alt', 'opt', 'par', 'critical', 'break'].map((v) => `blockKeywords.${v}`),
  ...['else', 'and'].map((v) => `elseKeywords.${v}`),
  ...['<|--', '<|..', '*--', 'o--', '-->', '..>'].map((v) => `classRelKinds.${v}`),
  ...['+', '-', '#', '~', 'none'].map((v) => `classVisibility.${v}`),
  ...['rectangle', 'rounded', 'stadium', 'subroutine', 'cylinder', 'circle', 'double-circle',
    'asymmetric', 'rhombus', 'hexagon', 'parallelogram', 'parallelogram-alt', 'trapezoid',
    'trapezoid-alt'].map((v) => `shapes.${v}`),
  ...['solid', 'dotted', 'thick', 'invisible'].map((v) => `linkStyles.${v}`),
  ...['arrow', 'none', 'circle', 'cross'].map((v) => `arrows.${v}`),
  ...['solid', 'dashed', 'dotted'].map((v) => `borderDash.${v}`),
  ...['TB', 'BT', 'LR', 'RL', 'followDefault'].map((v) => `directions.${v}`),
  ...['default', 'square', 'rounded', 'circle', 'bang', 'cloud', 'hexagon'].map((v) => `mindmapShapes.${v}`),
  ...['choice', 'fork', 'join'].map((v) => `statePseudoKinds.${v}`),
  ...['zero-one', 'one', 'zero-many', 'one-many'].map((v) => `erCardinalities.${v}`),
  ...['identifying', 'non-identifying'].map((v) => `erLines.${v}`),
]

beforeAll(() => {
  initI18n()
})

describe('英文第一批表单文案', () => {
  it('表单键与枚举组在英文下都翻译且不含中文、不回退裸 key', async () => {
    await setAppLanguage('en')
    for (const key of [...FORM_KEYS, ...ENUM_KEYS]) {
      const text = i18next.t(key)
      expect(text, `key ${key} 回退成了中文`).not.toMatch(/[\u4e00-\u9fff]/)
      expect(text, `key ${key} 是裸 key`).not.toBe(key)
    }
  })
})
