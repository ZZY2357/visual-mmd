import { beforeAll, describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { initI18n, setAppLanguage } from '../index'
import { flowchartMenuLabels } from '../../lib/editing/menu/flowchart'
import { sequenceMenuLabels } from '../../lib/editing/menu/sequence'
import { classMenuLabels } from '../../lib/editing/menu/class'
import { mindmapMenuLabels } from '../../lib/editing/menu/mindmap'
import { stateMenuLabels } from '../../lib/editing/menu/state'
import { erMenuLabels } from '../../lib/editing/menu/er'
import { gitgraphMenuLabels } from '../../lib/editing/menu/gitgraph'
import { timelineMenuLabels } from '../../lib/editing/menu/timeline'
import { ganttMenuLabels } from '../../lib/editing/menu/gantt'
import { kanbanMenuLabels } from '../../lib/editing/menu/kanban'
import { requirementMenuLabels } from '../../lib/editing/menu/requirement'
import { journeyMenuLabels } from '../../lib/editing/menu/journey'
import { pieMenuLabels } from '../../lib/editing/menu/pie'
import { sankeyMenuLabels } from '../../lib/editing/menu/sankey'
import { quadrantMenuLabels } from '../../lib/editing/menu/quadrant'
import { packetMenuLabels } from '../../lib/editing/menu/packet'
import { xychartMenuLabels } from '../../lib/editing/menu/xychart'
import { radarMenuLabels } from '../../lib/editing/menu/radar'
import { architectureMenuLabels } from '../../lib/editing/menu/architecture'
import { treemapMenuLabels } from '../../lib/editing/menu/treemap'
import { ishikawaMenuLabels } from '../../lib/editing/menu/ishikawa'
import { wardleyMenuLabels } from '../../lib/editing/menu/wardley'
import { vennMenuLabels } from '../../lib/editing/menu/venn'
import { cynefinMenuLabels } from '../../lib/editing/menu/cynefin'
import { usecaseMenuLabels } from '../../lib/editing/menu/usecase'
import { treeviewMenuLabels } from '../../lib/editing/menu/treeview'
import { eventmodelingMenuLabels } from '../../lib/editing/menu/eventmodeling'
import { zenumlMenuLabels } from '../../lib/editing/menu/zenuml'
import { c4MenuLabels } from '../../lib/editing/menu/c4'

/**
 * i18n-english 工单 03/04：图种菜单标签英文键与中文键一一对应。
 * 防止后续增改菜单项时只改一种语言。
 */

// 全部有文案定义的图种（agentflow / block 的菜单 id 无文案键，照实不在列）
const ALL_LABELS = [
  flowchartMenuLabels, sequenceMenuLabels, classMenuLabels, mindmapMenuLabels,
  stateMenuLabels, erMenuLabels, gitgraphMenuLabels, timelineMenuLabels,
  ganttMenuLabels, kanbanMenuLabels, requirementMenuLabels, journeyMenuLabels,
  pieMenuLabels, sankeyMenuLabels, quadrantMenuLabels, packetMenuLabels,
  xychartMenuLabels, radarMenuLabels, architectureMenuLabels, treemapMenuLabels,
  ishikawaMenuLabels, wardleyMenuLabels, vennMenuLabels, cynefinMenuLabels,
  usecaseMenuLabels, treeviewMenuLabels, eventmodelingMenuLabels, zenumlMenuLabels,
  c4MenuLabels,
]

beforeAll(() => {
  initI18n()
})

describe('菜单标签双语言键一致', () => {
  it('全部图种：英文下每个菜单键都不是中文、不是裸 key', async () => {
    await setAppLanguage('en')
    for (const labels of ALL_LABELS) {
      for (const id of Object.keys(labels)) {
        const text = i18next.t(`canvas.menu.${id}`)
        expect(text, `canvas.menu.${id} 回退成了中文`).not.toMatch(/[\u4e00-\u9fff]/)
      }
    }
  })

  it('跨图种共用菜单项在英文下可用', async () => {
    await setAppLanguage('en')
    for (const id of ['link-mode', 'link-from-here', 'edit-text', 'edit-label', 'add-note', 'add-section', 'delete']) {
      expect(i18next.t(`canvas.menu.${id}`), id).not.toMatch(/[\u4e00-\u9fff]/)
    }
  })
})
