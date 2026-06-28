# AGENTS.md

本文件给后续编码代理使用。项目是一个 Vite + Cytoscape.js 的知识图谱编辑器，示例数据为《红楼梦》人物关系。

## 项目概览

- 入口：`index.html` + `src/main.js`
- 图渲染：`src/graph.js`，负责 Cytoscape 初始化、布局、可见性、小地图、高亮与选择样式
- 数据状态：`src/store.js`，负责图谱数据、增删改、撤销重做、导入导出
- 侧栏 UI：`src/ui.js`，负责搜索、视图控件、节点树、布局配置、数据操作
- 内联编辑：`src/editor.js`，负责节点/边编辑、快捷键、关联模式
- 视图系统：`src/view/`
  - `viewState.js`：视图状态与 localStorage 持久化
  - `viewController.js`：计算可见节点/边、中心展开、聚合
  - `viewManager.js`：连接 store、graph 与 viewState
  - `relationCategories.js`：关系分类与默认启用项
  - `chapterUtils.js`：章节/时间轴过滤
  - `detailPanel.js`：左侧详情栏
- 默认数据：`src/data/defaultGraph.raw.js`、`src/data/defaultGraph.js`、`src/data/defaultGraph.chapters.js`
- 主题：`src/theme.js` + `src/styles.css`，夜晚模式会同步 CSS 与 Cytoscape 样式

## 常用命令

```bash
npm install
npm run build
npm test
npm run test:e2e
```

不要主动启动长期运行命令（如 `npm run dev`、`npm run preview`），除非用户明确要求。测试也只在用户要求或高风险改动需要验证时运行，并优先选择最小相关测试。

## 关键行为

- 默认视图是「中心展开」，以 `focusNodeId` 为中心按 `focusDepth` 跳数显示。
- 「显示全部」模式会忽略跳数，但仍受章节/时间轴过滤影响。
- 章节过滤先收窄已出场节点/边，再执行中心展开或渐进展开。
- 聚合通过节点 `tags` 计算；侧栏 `_root::标签` 表示全局折叠，同名标签会按父组织拆成多个聚合节点。
- 聚合节点 ID 使用 `__agg__<parentId>::<tag>`，不要手写不符合格式的 ID。
- 关系颜色来自 `relationCategories.js`，图上边的分类颜色在 `graph.js` 中按 `edge[category=...]` 设置。
- 用户浏览器可能已有旧的 `localStorage` 数据；默认数据变化后，如果界面未更新，提示用户点「恢复默认示例」。

## 开发约定

- 使用原生 JavaScript ES modules，不引入 React。
- 保持现有模块边界：数据计算放 `src/view/` 或 `src/store.js`，DOM 控件放 `src/ui.js`，Cytoscape 样式/交互放 `src/graph.js`。
- 修改默认图谱时优先改 `src/data/defaultGraph.raw.js`；人物首次出场回目放 `src/data/defaultGraph.chapters.js`。
- 新增关系类型时，同步检查 `src/view/relationCategories.js`、右侧关系筛选和图上颜色。
- 改 UI 时同时检查亮色与夜晚模式，尤其是输入框、按钮、侧栏、图谱节点/边、小地图、内联编辑器。
- 不要回滚用户已有修改。若工作区已有不相关改动，保留它们。
- 默认使用 ASCII；中文文案可以使用中文。

## 测试

- 单元测试：`tests/view.test.js`、`tests/store.test.js`
- E2E 测试：`tests/e2e/*.spec.ts`
- 视图逻辑改动应优先补 `tests/view.test.js`。
- store/导入导出/撤销重做改动应优先补 `tests/store.test.js`。
- 画布交互、拖拽、平移等浏览器行为改动可补 Playwright E2E。

## 常见坑

- `computeVisibility()` 的结果既服务主图，也服务小地图和侧栏状态；改可见性时要考虑三处同步。
- 暗色主题样式追加在 Cytoscape 样式末尾，避免通用 `edge` 规则覆盖分类边颜色。
- 侧栏聚合按钮要按聚合前可见节点统计，否则折叠后按钮会消失。
- 时间轴数据支持 `chapter`、`time`、`appearAt`，没有章节信息的节点在时间轴开启时不显示。
- `graph.sync(..., { applyVisibility: false })` 后通常需要显式调用 `graph.applyVisibility()`。
