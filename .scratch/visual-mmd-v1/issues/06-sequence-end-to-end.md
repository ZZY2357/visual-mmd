# 06 — Sequence 端到端

**What to build:** 时序图全链路：解析器（participant/actor、四种消息、autonumber、activate/deactivate 含简写、note over/left/right、loop/alt-else/opt/par-and/critical/break 块，全部带 span）+ 属性面板表单编辑 + 该类型模板。create/destroy、rect、box 不解析、原样保留。演示：全程用表单画出一张带逻辑块和 note 的时序图。

**Blocked by:** 04 — Flowchart 可视化编辑端到端（复用其建立的三栏 UI 与表单框架）。

**Status:** ready-for-agent

- [ ] 解析器三类用例（verbatim identity / 手术式改写 / 金样）全绿
- [ ] 表单增删改参与者、消息、note、逻辑块，手术式落码可撤销
- [ ] 新建时序图从模板起步
- [ ] 清单外语法（create/destroy、rect、box）原样保留
