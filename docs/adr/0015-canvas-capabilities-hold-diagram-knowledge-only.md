# 画布能力包只装图种知识，DOM 运行期测量留在外面

`CanvasPanel.tsx` 有 24 处 `projection.type ===`，散在 6 个分发函数里
（`resolverOf` / `canvasToEditorSelection` / `selectedDataIdOf` / `nodeDataIdsOf` /
`keyboardProjectionOf` / `annotateEdges`），`PropertyPanel.tsx:237` 还有第七处。
`canvas-selection/data-id.ts` 的头注释承诺「新图种接入画布选中只需实现一个 resolver」——
但画布实际需要 6 种能力，只有第 1 种落到了 seam 上，sequence / class 是在 `resolverOf` 里现场拼的。

收拢时有一个岔路：这个能力包到底装到多满。`canvas-keyboard.ts:243` 的 `CanvasNavigation`
已经是一个能力包（`extents` / `dataIdOf` / `toSelection` / `reveal` / `firstSelection`），
其中 `extents` 与 `reveal` 依赖 DOM 容器与 `useCanvasView` 的 `revealRect`。
把这两项一并收进能力包看起来更"完整"，但会让包持有容器引用、变成有状态对象。

**决定**：

- **`CanvasCapabilities` 只装静态图种知识**——`dataIdResolver` / `toSelection` / `canvasIdOf` /
  `navigationIds` / `keyboardProjection` / `edgeAnnotator?` / `resolveSelection`。
  这些都能从投影纯函数算出，不碰 DOM。
- **`extents` 与 `reveal` 不进包**。`CanvasNavigation` 继续由 hook 层用
  **「能力包的图种知识 + 容器」** 组装，也就是现在 `CanvasPanel.tsx:449-488` 的组装方式搬到 hook 层。
  这样 `use-canvas-keyboard` 现有的假实现注入方式完全不变。
- **能力包的接口定义在 `src/lib/canvas-selection/capabilities.ts`，
  实例挂在 `DiagramTypeRegistration.canvas` 字段上。** registry 只持有引用、不含实现，
  因此不会从 143 行撑成杂物抽屉；同时「加一种图」仍是一处改动
  （新建 adapter + 在 registration 上挂一行）。

**被否掉的替代**：把 `extents` / `reveal` 也收进包、让包持有容器引用。
否决理由不是审美——是那样一来包就变成有状态对象，`use-canvas-keyboard` 现有的
「注入假 navigation 即可测」的能力会失效，而这个能力正是当前方位导航（ADR-0011）
唯一能脱离真机验收的测试手段（AGENTS.md 默认不做真机验收）。

**后果**：

- 能力包本身无 DOM 依赖，可纯单测；`CanvasPanel` 从缝合层变成可以注入假 bundle 的薄壳，
  终于能写测试（它目前是全库唯一没有测试文件的组件）。
- `extents` / `reveal` 的组装逻辑仍在 hook 层，若将来要测它，测的是 hook 而非包——
  这是接受了的代价，换来的是包可以被 4 个 adapter 各自实现而不牵动 DOM。
- 与 ADR-0007 / ADR-0012 不冲突：那两条裁定「用什么当元素身份」，本条收敛的是
  「谁把这些身份翻译成画布行为」。
