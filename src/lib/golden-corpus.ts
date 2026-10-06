/**
 * 金样库（ticket 05）。
 *
 * 从「每图种一条起步模板」扩为每图种多条覆盖**起步级 / 核心语法 / 边角语法**
 * （注释 / 空行 / 特殊字符）的真实源码，并含**纯中文显示文本**样例（无 ASCII 节点 id，
 * 显示文本即语法标识——目标用户的主路径）。
 *
 * 这是防 mermaid 升级语法漂移的第一道网：全部样例都必须通过真实 `mermaid.parse`。
 * 本模块是**纯数据**（不 import mermaid、不 import 注册表），供测试与 ticket 08
 * （DOM 契约冒烟）作为输入源复用。
 *
 * 结构：
 * - `GoldenSample.kind` 标明样例定位：`starter`（起步级）、`core`（核心语法）、
 *   `corner`（边角语法：注释 / 空行 / 特殊字符）、`chinese`（纯中文显示文本）。
 * - `GoldenCorpusEntry.chineseUnsupportedReason`：少数图种的语法**强制 ASCII 标识符**
 *   （节点 id 本身必须 ASCII，无法「显示文本即标识」），纯中文无 id 样例在语法上不可能。
 *   这类图种登记豁免并给出理由；普通中文标签样例仍包含在 `core` / `corner` 中。
 * - `external`：外部渲染器图种（zenuml）。其 parse 依赖异步注册外部插件、且在本仓
 *   测试环境因网络/外部包不可用而失败（**既有事实**，见 golden-validity.test.ts 的
 *   zenuml 用例）。语料仍收录其样例供 ticket 08 使用，但合法性测试跳过其 parse 断言。
 */

/** 单个金样 */
export interface GoldenSample {
  /** 样例定位 */
  kind: 'starter' | 'core' | 'corner' | 'chinese'
  /** 人类可读描述（失败信息里指明是哪条金样） */
  description: string
  /** mermaid 源码（可含 frontmatter 与否均可，须能真实 parse） */
  source: string
}

/** 一个图种的金样集合 */
export interface GoldenCorpusEntry {
  /** 图种 id（与 DIAGRAM_TYPE_LIST 的 registration.id 一致） */
  type: string
  /** 是否为外部渲染器图种（zenuml）：合法性测试跳过其 parse 断言 */
  external?: boolean
  /** 该图种语法是否**不可能**写出纯中文无 id 样例；非空即豁免并说明理由 */
  chineseUnsupportedReason?: string
  samples: GoldenSample[]
}

/** 图种 id → 金样集合。键须与 DIAGRAM_TYPE_LIST 完全一致（由测试钉住）。 */
export const GOLDEN_CORPUS: Record<string, GoldenCorpusEntry> = {
  flowchart: {
    type: 'flowchart',
    samples: [
      {
        kind: 'starter',
        description: '起步级：TD 方向、两个节点、带标签边',
        source: `flowchart TD
    A[开始] --> B{是否学会 Mermaid?}
    B -- 是 --> C[享受画图]
    B -- 否 --> D[用 Visual MMD]
    D --> C
`,
      },
      {
        kind: 'core',
        description: '核心语法：subgraph、多种形状、链式与类样式',
        source: `flowchart LR
    subgraph 处理[处理流程]
        A[开始] --> B{判断}
        B -- 是 --> C(成功)
        B -- 否 --> D((失败))
    end
    C --> E[/结束/]
    D --> E
    classDef ok fill:#d3f9d8,stroke:#2f9e44
    class C ok
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的引号标签',
        source: `%% 流程图边角语法：注释与空行

flowchart TD
    A["含,逗号 与 #井号"] --> B{"含|竖线?"}

    %% 行内注释：菱形分支
    B --> C["引号内的 '单引号'"]
    C --> D["emoji 😀 与符号 & < >"]
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：无 ASCII id，显示文本即标识',
        source: `flowchart TD
    开始 --> 判断
    判断 -->|是| 完成
    判断 -->|否| 开始
`,
      },
    ],
  },

  sequence: {
    type: 'sequence',
    samples: [
      {
        kind: 'starter',
        description: '起步级：actor/participant、两条消息',
        source: `sequenceDiagram
    Alice->>Bob: 你好
    Bob-->>Alice: 你好呀
`,
      },
      {
        kind: 'core',
        description: '核心语法：autonumber、activate、alt/loop、Note',
        source: `sequenceDiagram
    autonumber
    participant A as 客户端
    participant B as 服务端
    A->>B: 请求数据
    activate B
    B-->>A: 返回结果
    deactivate B
    alt 成功
        A->>B: 确认
    else 失败
        A->>B: 重试
    end
    loop 3 次
        B->>B: 自检
    end
    Note over A,B: 交互备注
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的消息',
        source: `%% 时序图边角语法

sequenceDiagram
    %% 参与者别名
    participant A as "甲(含括号)"
    A->>A: 自调用 self()
    A-->>A: 返回 #tag; 与 <br/> 换行
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：参与者与消息全中文',
        source: `sequenceDiagram
    用户->>系统: 打开图表
    系统-->>用户: 渲染完成
    用户->>系统: 修改属性
`,
      },
    ],
  },

  class: {
    type: 'class',
    samples: [
      {
        kind: 'starter',
        description: '起步级：类、属性、方法、继承',
        source: `classDiagram
    class BankAccount
    BankAccount : +String owner
    BankAccount : +deposit(amount) bool
    class Account~T~{
        +T value
        +get() T
    }
    BankAccount <|-- Account~T~
`,
      },
      {
        kind: 'core',
        description: '核心语法：多重关系、注释、classDef、annotation',
        source: `classDiagram
    class Animal
    class Dog
    class Cat
    Animal <|-- Dog
    Animal <|-- Cat
    Dog "1" o-- "*" Cat : 同伴
    Dog ..> Cat : 观察
    note for Dog "忠诚"
    classDef highlight fill:#fff3bf,stroke:#f08c00
    <<interface>> Animal
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的标签',
        source: `%% 类图边角语法

classDiagram
    class 账户
    账户 : +余额

    %% 关系标签含特殊字符
    账户 --> 流水 : "记 #1 笔"
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：类名、属性、方法全中文',
        source: `classDiagram
    账户 : +余额
    账户 : +取款(金额) 布尔
    储蓄账户 <|-- 账户
    储蓄账户 : +利率
`,
      },
    ],
  },

  mindmap: {
    type: 'mindmap',
    samples: [
      {
        kind: 'starter',
        description: '起步级：根节点与两层分支',
        source: `mindmap
  root((中心主题))
    分支一
      叶子甲
      叶子乙
    分支二
`,
      },
      {
        kind: 'core',
        description: '核心语法：多种形状、图标、多级缩进',
        source: `mindmap
  root))根((
    方形[方形节点]
      圆形(圆形节点)
    云朵)云朵节点(
      ::icon(fa fa-book)
      要点
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的节点',
        source: `%% 思维导图边角语法

mindmap
  root((根))

    "含,逗号 的节点"
      含 #1 的叶子
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：节点全中文',
        source: `mindmap
  核心((核心能力))
    可视化编辑
      结构树
      属性表单
    双面板同步
`,
      },
    ],
  },

  state: {
    type: 'state',
    samples: [
      {
        kind: 'starter',
        description: '起步级：初始转移、普通状态、描述',
        source: `stateDiagram-v2
    [*] --> idle
    idle : 等待输入
    idle --> running : 开始
    running --> [*]
`,
      },
      {
        kind: 'core',
        description: '核心语法：复合状态、note、choice',
        source: `stateDiagram-v2
    [*] --> 空闲
    空闲 --> 运行 : 启动
    state 运行 {
        [*] --> 处理
        处理 --> 完成
    }
    运行 --> [*]
    note right of 空闲
        双击可编辑描述
    end note
    state 判断 <<choice>>
    空闲 --> 判断
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的状态描述',
        source: `%% 状态图边角语法

stateDiagram-v2
    [*] --> A

    A : 含,逗号 的描述
    A --> B : 含 | 竖线
    B --> [*]
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：状态名与转移标签全中文',
        source: `stateDiagram-v2
    [*] --> 空闲
    空闲 --> 运行 : 启动
    运行 --> 完成 : 结束
    完成 --> [*]
`,
      },
    ],
  },

  er: {
    type: 'er',
    samples: [
      {
        kind: 'starter',
        description: '起步级：两实体、一条关系',
        source: `erDiagram
    CAR {
        string make PK "制造商"
        string model "型号"
    }
    DRIVER
    CAR ||--|{ DRIVER : "drives"
`,
      },
      {
        kind: 'core',
        description: '核心语法：direction、多种基数、属性块',
        source: `erDiagram
    direction LR
    CAR {
        string make PK "制造商"
        string model "型号"
        int? year
    }
    DRIVER {
        string name
    }
    CAR ||--|{ DRIVER : "drives"
    DRIVER }|..|{ CAR : "insured by"
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的属性注释',
        source: `%% ER 图边角语法

erDiagram
    A {
        string x PK "含,逗号 的注释"
    }

    %% 关系标签含特殊字符
    A ||--o{ B : "has #1"
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：实体名、属性名、关系标签全中文',
        source: `erDiagram
    客户 {
        string 姓名
        string 编号 PK
    }
    订单 {
        string 单号
    }
    客户 ||--o{ 订单 : 下单
`,
      },
    ],
  },

  gitgraph: {
    type: 'gitgraph',
    samples: [
      {
        kind: 'starter',
        description: '起步级：main 两提交、分支、merge',
        source: `gitGraph
    commit id: "init"
    commit id: "docs"
    branch feature
    commit
    commit
    checkout main
    merge feature tag: "v1.0"
`,
      },
      {
        kind: 'core',
        description: '核心语法：tag、type、branch order、cherry-pick',
        source: `gitGraph
    commit id: "a"
    commit id: "b" tag: "v1"
    branch develop order: 2
    commit id: "c" type: HIGHLIGHT
    checkout main
    commit id: "d" type: REVERSE
    merge develop
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的提交 id',
        source: `%% gitGraph 边角语法

gitGraph
    commit id: "初始, 含逗号"

    %% 分支名必须 ASCII
    branch dev
    commit id: "修复 #1"
    checkout main
    merge dev
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：提交 id 全中文（无 ASCII 分支名）',
        source: `gitGraph
    commit id: "初始提交"
    commit id: "添加功能" tag: "v1.0"
    commit id: "修复缺陷"
`,
      },
    ],
  },

  timeline: {
    type: 'timeline',
    samples: [
      {
        kind: 'starter',
        description: '起步级：title、一个 section、两个时期',
        source: `timeline
    title 产品演进路线
    section 第一阶段
        需求分析 : 调研
            : 评审
        设计发布
`,
      },
      {
        kind: 'core',
        description: '核心语法：多个 section、多事件、period 多行',
        source: `timeline
    title 发展历程
    section 2024
        第一季度 : 立项
                : 调研
        第二季度 : 开发
    section 2025
        第一季度 : 发布
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的时期与事件',
        source: `%% 时间线边角语法

timeline
    title 含,逗号 的标题

    section 阶段一
        含|竖线 的时期 : 含 #1 的事件
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：标题、分组、事件全中文',
        source: `timeline
    title 项目里程碑
    section 准备期
        需求梳理 : 访谈
        方案设计
    section 执行期
        开发 : 联调
`,
      },
    ],
  },

  kanban: {
    type: 'kanban',
    samples: [
      {
        kind: 'starter',
        description: '起步级：三列、每列卡片',
        source: `kanban
  Todo[待办]
    t1[接入解析器]
    t2[补充测试]
  Doing[进行中]
    t3[接入画布]
  Done[已完成]
    t4[搭建注册表]
`,
      },
      {
        kind: 'core',
        description: '核心语法：卡片 @{} 元数据（assigned/ticket/priority）',
        source: `kanban
  Todo[待办]
    t1[接入 kanban 解析器]@{ assigned: '张三', ticket: 'VMMD-101', priority: 'High' }
    t2[补充单元测试]@{ priority: 'Low' }
  Doing[进行中]
    t3[接入画布能力包]
  Done[已完成]
    t4[搭建图种注册表]
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的卡片文本',
        source: `%% kanban 边角语法

kanban
  待办[待办]

    卡片一[含,逗号 的卡片]
    卡片二[含 #1 标签]
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：列名与卡片全中文',
        source: `kanban
  待办[待办]
    需求梳理[需求梳理]
    方案设计[方案设计]
  进行中[进行中]
    编码实现[编码实现]
  已完成[已完成]
    上线发布[上线发布]
`,
      },
    ],
  },

  requirement: {
    type: 'requirement',
    chineseUnsupportedReason:
      'requirementDiagram 的需求/元素 id 必须是 ASCII 标识符（Langium ID token），无法「显示文本即标识」；中文只能作 text 字段值（见 core 样例）。',
    samples: [
      {
        kind: 'starter',
        description: '起步级：functionalRequirement + element + satisfies',
        source: `requirementDiagram
    functionalRequirement login {
        id: "REQ-1"
        text: "用户可登录"
        risk: Medium
        verifymethod: Test
    }
    element loginUI {
        type: "登录界面"
        docref: "docs/ui.md"
    }
    loginUI - satisfies -> login
`,
      },
      {
        kind: 'core',
        description: '核心语法：direction、多种 requirement 类型、多关系',
        source: `requirementDiagram
    direction LR
    functionalRequirement f1 {
        id: "R-1"
        text: "功能需求"
        risk: High
        verifymethod: Analysis
    }
    performanceRequirement p1 {
        id: "P-1"
        text: "性能需求"
        risk: Low
        verifymethod: Test
    }
    element e1 {
        type: "元素"
        docref: "docs/e.md"
    }
    e1 - satisfies -> f1
    f1 - derives -> p1
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的 text',
        source: `%% requirement 边角语法

requirementDiagram

    functionalRequirement f1 {
        id: "R-1"
        text: "含,逗号 与 #1 的文本"
        risk: Medium
        verifymethod: Test
    }
`,
      },
    ],
  },

  journey: {
    type: 'journey',
    samples: [
      {
        kind: 'starter',
        description: '起步级：title、一个 section、两个任务',
        source: `journey
    title 用户旅程示例
    section 发现
        访问首页: 5: 用户
        浏览商品: 3: 用户
`,
      },
      {
        kind: 'core',
        description: '核心语法：多 section、多 actor、低分任务',
        source: `journey
    title 购物旅程
    section 发现
        搜索: 5: 用户, 搜索引擎
        浏览: 4: 用户
    section 决策
        对比: 2: 用户
        下单: 4: 用户, 客服
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的任务名',
        source: `%% journey 边角语法

journey
    title 含,逗号 的标题

    section 阶段一
        含|竖线 的任务: 3: 用户
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：标题、分组、任务、actor 全中文',
        source: `journey
    title 用户下单旅程
    section 发现
        访问首页: 5: 用户
        搜索商品: 3: 用户
    section 决策
        对比价格: 2: 用户
        提交订单: 4: 用户, 客服
`,
      },
    ],
  },

  pie: {
    type: 'pie',
    samples: [
      {
        kind: 'starter',
        description: '起步级：pie showData、title、三个扇区',
        source: `pie showData
    title 预算分配
    "研发" : 45
    "市场" : 30
    "运营" : 25
`,
      },
      {
        kind: 'core',
        description: '核心语法：无 showData、小数与较多扇区',
        source: `pie
    title 流量来源
    "直接访问" : 42.5
    "搜索引擎" : 30
    "社交媒体" : 17.5
    "其他" : 10
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的扇区标签',
        source: `%% pie 边角语法

pie showData
    title 含,逗号 的标题

    "含 #1 的扇区" : 60
    "含|竖线" : 40
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：标题与扇区标签全中文',
        source: `pie showData
    title 预算分配
    "研发" : 45
    "市场" : 30
    "运营" : 25
`,
      },
    ],
  },

  block: {
    type: 'block',
    samples: [
      {
        kind: 'starter',
        description: '起步级：columns、三种形状、一条带标签边',
        source: `block-beta
    columns 3
    a["输入"]
    b{"校验"}
    c["输出"]
    a --> b
    b -- "通过" --> c
`,
      },
      {
        kind: 'core',
        description: '核心语法：嵌套 block、space、多种边算子、类',
        source: `block-beta
    columns 3
    a["输入"]
    space
    b{"校验"}
    c["输出"]
    block:group1
        columns 2
        d("缓存")
        e[("数据库")]
    end
    a --> b
    b -- "通过" --> c
    classDef ok fill:#d3f9d8
    class c ok
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的块标签',
        source: `%% block 边角语法

block-beta
    columns 2

    a["含,逗号"]
    b{"含 #1"}

    a --> b
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：块 id 与标签全中文',
        source: `block-beta
    columns 2
    开始["开始"]
    结束["结束"]
    开始 --> 结束
`,
      },
    ],
  },

  sankey: {
    type: 'sankey',
    chineseUnsupportedReason:
      'sankey 词法把每个字段限制为可打印 ASCII（lexer 规则 [\\u0020-\\u0021\\u0023-\\u002B\\u002D-\\u007E]），非 ASCII（中文）字符根本无法成 token——纯中文样例在语法上不可能；节点名只能 ASCII（见注册表模板注释）。',
    samples: [
      {
        kind: 'starter',
        description: '起步级：sankey-beta 声明 + 三条链路',
        source: `sankey-beta

a,b,10
b,c,5
b,d,5
`,
      },
      {
        kind: 'core',
        description: '核心语法：多汇点、带引号含逗号的 source',
        source: `sankey-beta

electricity,grid,10
electricity,"gas, natural",6
grid,home,9
"gas, natural",home,7
`,
      },
      {
        kind: 'corner',
        description: '边角语法：空行、带引号含特殊字符的字段',
        source: `%% sankey 边角语法（注释行会被跳过）

sankey-beta

"a, x","b (y)",1
b,c,2.5
`,
      },
    ],
  },

  gantt: {
    type: 'gantt',
    samples: [
      {
        kind: 'starter',
        description: '起步级：dateFormat、title、两个 section',
        source: `gantt
    dateFormat YYYY-MM-DD
    title 项目排期
    section 调研
        需求梳理 :done, a1, 2026-01-05, 3d
        方案设计 :active, a2, after a1, 5d
    section 开发
        编码实现 :after a2, 4d
`,
      },
      {
        kind: 'core',
        description: '核心语法：axisFormat、milestone、crit、排除日期',
        source: `gantt
    dateFormat YYYY-MM-DD
    axisFormat %m-%d
    excludes weekends
    title 发布计划
    section 里程碑
        版本冻结 :milestone, m1, 2026-02-01, 0d
    section 开发
        编码 :crit, a1, 2026-01-05, 10d
        测试 :after a1, 5d
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的任务名',
        source: `%% gantt 边角语法

gantt
    dateFormat YYYY-MM-DD
    title 含,逗号 的标题

    section 阶段一
        含|竖线 的任务 :a1, 2026-01-01, 3d
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：标题、分组、任务全中文',
        source: `gantt
    dateFormat YYYY-MM-DD
    title 项目排期
    section 调研阶段
        需求梳理 :a1, 2026-01-05, 3d
        方案设计 :after a1, 5d
    section 开发阶段
        编码实现 :4d
`,
      },
    ],
  },

  quadrant: {
    type: 'quadrant',
    samples: [
      {
        kind: 'starter',
        description: '起步级：title、双轴、四象限、一个点',
        source: `quadrantChart
    title 需求优先级
    x-axis 低价值 --> 高价值
    y-axis 低成本 --> 高成本
    quadrant-1 立即去做
    quadrant-2 规划排期
    quadrant-3 重新评估
    quadrant-4 谨慎投入
    Campaign A: [0.3, 0.6]
`,
      },
      {
        kind: 'core',
        description: '核心语法：点样式段、:::class、classDef',
        source: `quadrantChart
    title 需求优先级
    x-axis 低价值 --> 高价值
    y-axis 低成本 --> 高成本
    quadrant-1 立即去做
    quadrant-2 规划排期
    quadrant-3 重新评估
    quadrant-4 谨慎投入
    Campaign A: [0.3, 0.6]
    Campaign B:::highlight: [0.45, 0.23]
    Campaign C: [0.57, 0.69] radius: 8, color: #ff6b00
    classDef highlight color:#f08c00
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的点文本',
        source: `%% quadrant 边角语法

quadrantChart
    title 含,逗号 的标题

    x-axis 低 --> 高
    y-axis 低 --> 高
    quadrant-1 一
    quadrant-2 二
    quadrant-3 三
    quadrant-4 四

    含 #1 的点: [0.5, 0.5]
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：标题、轴、象限、点全中文',
        source: `quadrantChart
    title 需求优先级评估
    x-axis 低价值 --> 高价值
    y-axis 低成本 --> 高成本
    quadrant-1 立即去做
    quadrant-2 规划排期
    quadrant-3 重新评估
    quadrant-4 谨慎投入
    需求甲: [0.3, 0.6]
    需求乙: [0.7, 0.2]
`,
      },
    ],
  },

  packet: {
    type: 'packet',
    samples: [
      {
        kind: 'starter',
        description: '起步级：绝对位区间 + +count 衔接',
        source: `packet
    0-15: "Source Port"
    16-31: "Destination Port"
    +16: "Flags"
`,
      },
      {
        kind: 'core',
        description: '核心语法：更多字段、单字段 +count、无引号数字段',
        source: `packet
    0-3: "Version"
    4-7: "IHL"
    8-15: "TOS"
    16-31: "Total Length"
    +16: "Identification"
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的字段名',
        source: `%% packet 边角语法

packet
    0-7: "含,逗号 的字段"

    8-15: "含 #1"
    +16: "含|竖线"
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：字段名全中文',
        source: `packet
    0-15: "源端口"
    16-31: "目的端口"
    +16: "标志位"
`,
      },
    ],
  },

  xychart: {
    type: 'xychart',
    samples: [
      {
        kind: 'starter',
        description: '起步级：类别轴、bar 与带名 line',
        source: `xychart-beta
    title "季度销售"
    x-axis ["一季度", "二季度", "三季度"]
    y-axis "销售额" 0 --> 400
    bar [200, 350, 150]
    line "均线" [150, 250, 300]
`,
      },
      {
        kind: 'core',
        description: '核心语法：数值 x 轴、多条系列、horizontal 方向',
        source: `xychart-beta horizontal
    title "趋势"
    x-axis 1 --> 5
    y-axis "值" 0 --> 100
    bar [10, 20, 30, 40, 50]
    line [50, 40, 30, 20, 10]
    line "目标" [30, 30, 30, 30, 30]
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的引号标签',
        source: `%% xychart 边角语法

xychart-beta
    title "含,逗号 的标题"

    x-axis ["含 #1", "含|竖线"]
    y-axis "值" 0 --> 10
    bar [3, 7]
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：标题、轴、类别、系列全中文',
        source: `xychart-beta
    title "季度销售趋势"
    x-axis ["一季度", "二季度", "三季度"]
    y-axis "销售额" 0 --> 400
    bar "实际" [200, 350, 150]
    line "预测" [180, 300, 320]
`,
      },
    ],
  },

  radar: {
    type: 'radar',
    chineseUnsupportedReason:
      'radar-beta 的 axis / curve id 必须是 ASCII 标识符（Langium ID token），无法「显示文本即标识」；中文只能作引号 label（见 core/corner 样例）。',
    samples: [
      {
        kind: 'starter',
        description: '起步级：四个轴、两条曲线（值列表与键值）',
        source: `radar-beta
    title 技能评估
    axis math["数学"], science["科学"], art["艺术"], sport["体育"]
    curve alice["Alice"]{ 1, 2, 3, 4 }
    curve bob["Bob"]{ math: 4, science: 3, art: 2, sport: 1 }
    max 5
    graticule circle
`,
      },
      {
        kind: 'core',
        description: '核心语法：max、ticks、showLegend、graticule polygon',
        source: `radar-beta
    title 能力模型
    axis a["甲"], b["乙"], c["丙"]
    curve x["X"]{ 3, 4, 5 }
    curve y["Y"]{ a: 5, b: 2, c: 4 }
    max 5
    ticks 5
    graticule polygon
    showLegend true
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的引号 label',
        source: `%% radar 边角语法

radar-beta
    title "含,逗号 的标题"

    axis a["含 #1"], b["含|竖线"]
    curve c["C"]{ 1, 2 }
    max 3
`,
      },
    ],
  },

  architecture: {
    type: 'architecture',
    chineseUnsupportedReason:
      'architecture-beta 的 group / service / junction id 必须是 ASCII（[\\w]([-\\w]*\\w)?），无法「显示文本即标识」；中文只能作 [] 内的标题（见 core/corner 样例）。',
    samples: [
      {
        kind: 'starter',
        description: '起步级：group、service、直边',
        source: `architecture-beta
    group platform(cloud)[平台]
    service web(server)[Web 服务]
    service db(database)[数据库] in platform
    web:R -- L:db
`,
      },
      {
        kind: 'core',
        description: '核心语法：嵌套 group、junction、带箭头边与端口',
        source: `architecture-beta
    group platform(cloud)[平台]
    group private(cloud)[私有子网] in platform
    service web(server)[Web 服务]
    service db(database)[数据库] in private
    service cache(disk)[缓存]
    junction j1
    web:R -- L:db
    web:B --> T:j1
    j1:R -- L:cache
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的标题',
        source: `%% architecture 边角语法

architecture-beta
    service web(server)[含,逗号 的标题]

    service db(database)[含 #1 的标题]
    web:R -- L:db
`,
      },
    ],
  },

  treemap: {
    type: 'treemap',
    samples: [
      {
        kind: 'starter',
        description: '起步级：根 Section、两个二级 Section、叶子',
        source: `treemap
"预算分配"
    "运营"
        "人力": 700000
        "设备": 200000
    "市场"
        "广告": 400000
`,
      },
      {
        kind: 'core',
        description: '核心语法：多级嵌套、多叶子、小数数值',
        source: `treemap
"公司"
    "产品"
        "前端": 12.5
        "后端": 20
        "设计": 8
    "运营"
        "市场": 15
        "销售": 18
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的引号名',
        source: `%% treemap 边角语法

treemap
"含,逗号 的根"

    "含 #1 的分组"
        "含|竖线 的叶子": 10
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：分组与叶子全中文',
        source: `treemap
"预算分配"
    "运营"
        "人力": 700000
        "设备": 200000
    "市场"
        "广告": 400000
`,
      },
    ],
  },

  ishikawa: {
    type: 'ishikawa',
    samples: [
      {
        kind: 'starter',
        description: '起步级：鱼头 + 三个主因 + 二级因',
        source: `ishikawa-beta
    照片模糊
    人
        手抖
        没按稳
    设备
        镜头脏
`,
      },
      {
        kind: 'core',
        description: '核心语法：多主因、多级子因、相对缩进',
        source: `ishikawa-beta
    交付延期
    人员
        排期不足
            需求频繁变更
        技能不匹配
    流程
        评审缺失
    工具
        环境不稳定
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的因',
        source: `%% ishikawa 边角语法

ishikawa-beta
    含,逗号 的问题

    人
        含 #1 的主因
            含|竖线 的子因
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：问题与各层因全中文',
        source: `ishikawa-beta
    照片模糊
    人
        手抖
        没按稳
    设备
        镜头脏
        对焦不准
    环境
        光线太暗
`,
      },
    ],
  },

  wardley: {
    type: 'wardley',
    samples: [
      {
        kind: 'starter',
        description: '起步级：title、size、anchor、component、连线',
        source: `wardley-beta
title 茶铺价值链
size [1100, 600]
anchor "顾客" [0.95, 0.63]
component "茶" [0.63, 0.81]
component "热水" [0.52, 0.80]
"顾客" -> "茶"
"茶" -> "热水"
`,
      },
      {
        kind: 'core',
        description: '核心语法：evolution、inertia、evolve、多组件',
        source: `wardley-beta
title 价值链
size [1100, 600]
evolution "未建模" -> "分化" -> "收敛" -> "商品化"
anchor "顾客" [0.95, 0.63]
component "茶" [0.63, 0.81]
component "水壶" [0.43, 0.35] (inertia)
component "电力" [0.10, 0.70]
"顾客" -> "茶"
"茶" -> "水壶"
evolve "水壶" 0.62
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的引号名',
        source: `%% wardley 边角语法

wardley-beta
title 含,逗号 的标题

anchor "顾客 #1" [0.9, 0.6]
component "茶|饮品" [0.6, 0.8]
"顾客 #1" -> "茶|饮品"
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：标题、锚点、组件全中文',
        source: `wardley-beta
title 茶铺价值链
anchor "顾客" [0.95, 0.63]
component "茶" [0.63, 0.81]
component "热水" [0.52, 0.80]
component "水壶" [0.43, 0.35]
"顾客" -> "茶"
"茶" -> "热水"
"热水" -> "水壶"
`,
      },
    ],
  },

  venn: {
    type: 'venn',
    chineseUnsupportedReason:
      'venn-beta 的 set / union id 必须是 ASCII 标识符（Langium），无法「显示文本即标识」；中文只能作 ["…"] label（见 core/corner 样例）。',
    samples: [
      {
        kind: 'starter',
        description: '起步级：三个集合、两个交集',
        source: `venn-beta
    title 团队技能
    set frontend["前端"]
    set backend["后端"]
    set devops
    union frontend,backend["全栈"]
    union frontend,backend,devops["平台工程"]
`,
      },
      {
        kind: 'core',
        description: '核心语法：集合尺寸、无 label 集合、二元与三元交集',
        source: `venn-beta
    title 技能分布
    set a["甲"]: 20
    set b["乙"]: 15
    set c
    union a,b["甲乙"]
    union a,b,c["甲乙丙"]
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的 label',
        source: `%% venn 边角语法

venn-beta
    set a["含,逗号"]

    set b["含 #1"]
    union a,b["含|竖线"]
`,
      },
    ],
  },

  cynefin: {
    type: 'cynefin',
    samples: [
      {
        kind: 'starter',
        description: '起步级：五个域、条目、两条转移',
        source: `cynefin-beta
  title 事件响应
  complex
    "排查根因"
  complicated
    "分析数据"
  clear
    "重启服务"
  chaotic
    "呼叫值班"
  confusion
    "未知故障"
  complex --> complicated : "模式已识别"
  clear --> chaotic : "自满"
`,
      },
      {
        kind: 'core',
        description: '核心语法：多条目、无 title、单引号条目',
        source: `cynefin-beta
  complex
    "实验一"
    "实验二"
  complicated
    '分析'
  clear
    "执行"
  chaotic
    "应急"
  confusion
    "未知"
  complicated --> clear : "已识别"
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的条目与转移标签',
        source: `%% cynefin 边角语法

cynefin-beta
  title 含,逗号 的标题

  complex
    "含 #1 的条目"

  clear
    "含|竖线"
  complex --> clear : "含,逗号 的标签"
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：标题、域条目、转移标签全中文',
        source: `cynefin-beta
  title 事件响应分类
  complex
    "排查根因"
    "运行混沌实验"
  complicated
    "分析性能数据"
  clear
    "重启服务"
  chaotic
    "立即呼叫值班"
  confusion
    "未知故障模式"
  complex --> complicated : "模式已识别"
  clear --> chaotic : "自满"
`,
      },
    ],
  },

  usecase: {
    type: 'usecase',
    chineseUnsupportedReason:
      'usecase-beta 的 actor / 用例 id 必须是 ASCII 标识符（Langium IDENTIFIER），无法「显示文本即标识」；中文只能作 ("…") 标签（见 core/corner 样例）。',
    samples: [
      {
        kind: 'starter',
        description: '起步级：两个 actor、边界、用例、连线',
        source: `usecase-beta
    actor Customer("Customer")
    actor Admin("Administrator")
    systemBoundary shop["Online Shop"]
        Browse("Browse products")
        Checkout("Checkout")
    end
    Customer --> Browse
    Customer --> Checkout
    Admin --|> Customer
`,
      },
      {
        kind: 'core',
        description: '核心语法：include/extend、note、无标签 actor',
        source: `usecase-beta
    actor User
    actor Admin
    systemBoundary sys["系统"]
        Login("登录")
        Pay("支付")
        Refund("退款")
    end
    User --> Login
    User --> Pay
    Pay ..> : include Login
    Admin --|> User
    note for Pay "支持多种渠道"
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的用例标签',
        source: `%% usecase 边角语法

usecase-beta
    actor U("含,逗号")

    systemBoundary s["含 #1"]
        A("含|竖线")
    end
    U --> A
`,
      },
    ],
  },

  treeview: {
    type: 'treeview',
    samples: [
      {
        kind: 'starter',
        description: '起步级：根目录、两个子目录、文件',
        source: `treeView-beta
/
    src/
        main.ts
        utils.ts
    docs/
        README.md
`,
      },
      {
        kind: 'core',
        description: '核心语法：多级嵌套、Tab 缩进、深层文件',
        source: `treeView-beta
/
    packages/
        core/
            src/
                index.ts
            package.json
        ui/
            src/
                App.tsx
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的文件名',
        source: `%% treeview 边角语法

treeView-beta
/
    含,逗号 的目录/

        含 #1.ts
        含|竖线.md
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：目录与文件名全中文',
        source: `treeView-beta
/
    源码/
        入口.ts
        工具.ts
    文档/
        说明.md
`,
      },
    ],
  },

  eventmodeling: {
    type: 'eventmodeling',
    chineseUnsupportedReason:
      'eventmodeling 的帧实体标识是 EM_ID（ASCII 词），无法「显示文本即标识」；中文只能落在 data 块的 opaque 文本（见 core/corner 样例）。',
    samples: [
      {
        kind: 'starter',
        description: '起步级：三条帧、data 块',
        source: `eventmodeling

tf 01 ui CartUI
tf 02 cmd AddItem
tf 03 evt ItemAdded [[ItemAdded]]

data ItemAdded {
  description: string
  price: number
}
`,
      },
      {
        kind: 'core',
        description: '核心语法：更多帧、多个 data 块、关系推断',
        source: `eventmodeling

tf 01 ui ShopUI
tf 02 cmd AddItem
tf 03 evt ItemAdded [[ItemAdded]]
tf 04 pcr UpdateCart
tf 05 ui CartView
tf 06 cmd Checkout

data ItemAdded {
  sku: string
  qty: number
}
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、data 块内特殊字符',
        source: `%% eventmodeling 边角语法

eventmodeling

tf 01 ui UI

tf 02 cmd Cmd

data D {
  note: "含,逗号 与 #1"
  path: /a/b
}
`,
      },
    ],
  },

  agentflow: {
    type: 'agentflow',
    samples: [
      {
        kind: 'starter',
        description: '起步级：方向、两个 flow、多种形状与边',
        source: `agentflow-beta TB
  brief["Release brief"]@{ shape: input }
  flow writer["Drafting Agent"]
    draft["Draft notes"]@{ shape: task }
    lookup["search"]@{ shape: tool }
    draft --> lookup
    draft -.- lookup
  end
  publish["Publish"]@{ shape: action }
  brief --> writer
  writer --> publish
`,
      },
      {
        kind: 'core',
        description: '核心语法：decision 形状、failure 边、global 块、链式边',
        source: `agentflow-beta LR
  in["输入"]@{ shape: input }
  flow main["主流程"]
    t["处理"]@{ shape: task }
    d["判断"]@{ shape: decision }
    t --> d
    d --x t
  end
  out["输出"]@{ shape: action }
  in --> main
  main --> out
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的节点标签',
        source: `%% agentflow 边角语法

agentflow-beta TB
  a["含,逗号"]@{ shape: task }

  b["含 #1"]@{ shape: action }

  a --> b
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：节点 id 与标签全中文',
        source: `agentflow-beta TB
  开始["开始"]@{ shape: input }
  处理["处理数据"]@{ shape: task }
  结束["结束"]@{ shape: action }
  开始 --> 处理
  处理 --> 结束
`,
      },
    ],
  },

  c4: {
    type: 'c4',
    samples: [
      {
        kind: 'starter',
        description: '起步级：Person、System、Rel',
        source: `C4Context
    title 网上银行
    Person(customer, "个人客户", "使用网银")
    System(banking, "网银系统", "核心能力")
    Rel(customer, banking, "访问", "HTTPS")
`,
      },
      {
        kind: 'core',
        description: '核心语法：System_Ext、边界块、SystemDb、命名参数 Rel',
        source: `C4Context
    title 网上银行系统
    Person(customer, "个人客户", "使用网银的个人用户")
    System(banking, "网银系统", "提供账户与转账能力")
    System_Ext(email, "邮件系统", "发送通知邮件")
    Enterprise_Boundary(b0, "银行边界") {
        SystemDb(db, "核心账务库", "存放账户余额")
    }
    Rel(customer, banking, "访问", "HTTPS")
    Rel(banking, email, "发送通知", "SMTP", $descr="通过邮件网关")
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的 label',
        source: `%% c4 边角语法

C4Context

    Person(p, "含,逗号", "含 #1")

    System(s, "含|竖线", "描述")
    Rel(p, s, "使用")
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：alias 与 label 全中文',
        source: `C4Context
    title 网上银行系统
    Person(客户, "个人客户", "使用网银的个人用户")
    System(网银, "网银系统", "提供账户与转账能力")
    System_Ext(邮件, "邮件系统", "发送通知邮件")
    Rel(客户, 网银, "访问", "HTTPS")
`,
      },
    ],
  },

  zenuml: {
    type: 'zenuml',
    external: true,
    samples: [
      {
        kind: 'starter',
        description: '起步级：两个参与者、同步与异步消息',
        source: `zenuml
    title 下单流程
    participant Client as "客户端"
    @Database Server
    Client->Server.placeOrder(item)
    if (item.stock > 0) {
        Server.checkStock()
    } else {
        Client->Server.reject()
    }
`,
      },
      {
        kind: 'core',
        description: '核心语法：participant 别名、注解、async 消息',
        source: `zenuml
    participant A as "甲"
    participant B as "乙"
    A->B.syncCall()
    A->>B.asyncCall()
    B-->A.reply()
`,
      },
      {
        kind: 'corner',
        description: '边角语法：注释、空行、含特殊字符的别名',
        source: `// zenuml 边角语法

zenuml
    participant A as "含,逗号 的别名"

    A->A.self()
`,
      },
      {
        kind: 'chinese',
        description: '纯中文显示文本：参与者与消息全中文',
        source: `zenuml
    title 下单流程
    participant 客户端 as "客户端"
    participant 服务端 as "服务端"
    客户端->服务端.下单(商品)
    服务端-->客户端.确认()
`,
      },
    ],
  },
}

/** 按图种 id 取金样集合（ticket 08 复用入口）。 */
export function getGoldenCorpusEntry(type: string): GoldenCorpusEntry | undefined {
  return GOLDEN_CORPUS[type]
}
