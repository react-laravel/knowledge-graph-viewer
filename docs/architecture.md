# 前端架构

## 目标

项目采用渐进式迁移，而不是一次性重写：

- React + TypeScript 负责页面结构、表单和可组合 UI。
- Cytoscape.js 继续作为命令式图形引擎，不把节点渲染交给 React。
- 已验证的领域逻辑可以暂时保留为 JavaScript 模块，再按边界逐个迁移。
- 每个迁移切片都必须通过类型检查、单元测试和生产构建。

## 当前分层

```text
index.html
  └─ src/main.tsx
      └─ React AppShell
          └─ bootstrapApplication()
              ├─ KnowledgeGraphApplication  依赖装配与工作区命令
              ├─ GraphSyncService           API、保存队列、ID 映射、删除墓碑
              ├─ KnowledgeStore             图谱领域数据与撤销/重做
              ├─ ViewManager                可见性与视图状态
              ├─ GraphManager               Cytoscape 适配器
              ├─ InlineEditor               编辑交互
              └─ SidebarPanel               过渡期 DOM 控制器
```

React 组件保留旧 DOM ID，是为了让现有命令式控制器和 Playwright 契约在迁移期继续工作。初始化完成后，应用壳把有类型的工作区命令接口交给 `WorkspaceHud`；它订阅只读视图/历史快照，独立渲染画布工具，不修改旧控制器管理的 DOM。缩放和可见节点适应仍由 `GraphManager` 执行，撤销/重做通过 `InlineEditor` 先解析当前编辑。

## 状态与副作用边界

| 边界 | 所有者 | 不应放入 |
|---|---|---|
| 节点、边、图谱、撤销栈 | `KnowledgeStore` | DOM、timer、网络 Promise |
| 可见节点、筛选、中心、时间轴 | `ViewManager` / `view/` | API 保存状态 |
| Cytoscape 实例、布局、小地图 | `GraphManager` | 业务持久化 |
| 防抖、串行保存、临时 ID、删除墓碑 | `GraphSyncService` | UI 选择状态 |
| 页面结构 | React components | Cytoscape 节点元素 |
| 工具栏菜单与侧边栏开合 | `SidebarPanel` 写入的 DOM class / ARIA | 与 DOM 并行的私有布尔状态 |

一次 store 变更只能由应用级订阅触发一次 `viewManager.applyView()`。侧栏订阅只更新树、搜索和操作区，不能再次触发整图同步。

## React 迁移规则

1. 新增页面 UI 默认使用 `.tsx` 和明确的 props 类型。
2. Cytoscape 通过单一画布适配器挂载；不要用 React 列表渲染图节点。
3. 在旧控制器具备完整 `destroy()` 前不要启用 React `StrictMode`，避免开发环境重复绑定全局事件。
4. 一个区域从旧控制器迁移到 React 后，必须同时移除该区域的直接 DOM 写入，不能长期双重所有权。
5. 现有 `window.cy` 与 `window.kgStore` 仅作为 E2E 和迁移兼容接口；最终替换为显式命令接口。
6. 不直接把 timer、Promise、Cytoscape 实例或草稿节点放进 React 状态库。
7. 迁移期命令式开关必须从当前 DOM class 读取状态，再由同一个方法同步 class、ARIA、`inert` 与遮罩；不得用第二份布尔值推测下一状态。
8. Cytoscape 画布位于可收缩的 flex 区域时，画布宿主必须允许收缩并裁剪溢出；侧栏回归不能只断言自身可见，还要用命中测试确认未被旧尺寸 canvas 遮挡。
9. 高密度关系图默认使用“智能降噪”：`viewController` 计算从当前中心开始的稳定最短路骨架，高跳数下限制常显业务关系数量；完整关系仍保留在 Cytoscape 中，选择/悬停端点时临时恢复，也可由用户切换为“全部关系”。

## 后续顺序

1. 为 `GraphManager`、`InlineEditor`、`SidebarPanel` 增加可清理的生命周期。
2. 将搜索、视图控件、节点树和详情面板逐区迁入 React。
3. 用 `useSyncExternalStore` 连接现有 store，先避免并行维护第二套业务状态。
4. 把编辑、移动、关联和保存生命周期改成可单测的 reducer/状态机。
5. 领域边界稳定后，再评估是否需要 Zustand；不要为了换栈先复制一套状态。
6. 最后移除兼容 DOM ID、`window.*` 和浏览器原生 `prompt/confirm`。

## 质量门

```bash
npm run typecheck
npm run test:unit
npm run build

# 本地完整检查
npm run check
```

画布交互或移动端布局发生变化时，还必须运行相应 Playwright 用例。
