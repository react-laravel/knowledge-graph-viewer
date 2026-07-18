# 知识图谱编辑器 (Knowledge Graph Viewer)

基于 Cytoscape.js + fcose 布局的交互式知识图谱编辑器，以红楼梦人物关系为示例数据。

## 功能

- **图谱可视化** — 节点/边自动布局，支持缩放、平移、小地图导航
- **内联编辑** — 单击选择，双击或 Enter/F2 编辑名称，Tab 创建子节点，编辑中 Enter 创建同级节点
- **关系管理** — Shift+点击关联两个节点，支持家族（分组）节点
- **搜索高亮** — 按名称/ID/关系类型搜索，匹配项高亮显示
- **树形列表** — 侧边栏节点树，支持展开/折叠、搜索、编辑、删除
- **多图谱** — 创建/切换/删除多个图谱，数据互不干扰
- **撤销重做** — ⌘Z / ⌘⇧Z 支持
- **导入导出** — JSON 格式导入导出，数据持久化到 localStorage
- **远程同步** — 可选对接后端 API 自动保存
- **DogeOW 单点登录** — 复用 DogeOW 账号，通过一次性票据 + PKCE 安全登录

## 快捷键

| 操作 | 按键 |
|------|------|
| 拖拽节点/家族 | 按住 `Space` + 拖拽 |
| 选择节点/关系 | 单击 |
| 中心/渐进展开 | 手动选择对应视图模式后单击节点 |
| 关联两个节点 | `Shift+点击` / `L` |
| 节点归入家族 | 选中家族 · `Shift+点击` 目标 |
| 创建子节点 | `Tab` |
| 创建同级节点 | `Enter` |
| 编辑节点名称 | `Enter` / `F2` / 双击节点 |
| 编辑关系类型 | `Enter` / `F2` / 双击连线 |
| 删除节点/关系 | `Del` |
| 撤销 / 重做 | `⌘Z` / `⌘⇧Z` |
| 取消编辑/关联 | `Esc` |

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 预览构建产物
npm run preview
```

## 单点登录配置

前端构建时可通过以下变量覆盖默认地址：

```bash
VITE_DOGEOW_URL=https://next.dogeow.com
VITE_KNOWLEDGE_API_URL=https://next-api.dogeow.com
```

生产环境还需要在 `dogeow-api` 中启用 `knowledge-graph` SSO 客户端，允许
`https://mind.dogeow.com` 作为返回来源。客户端使用 PKCE，不需要也不应配置前端密钥。

## 技术栈

- [Cytoscape.js](https://js.cytoscape.org/) — 图可视化引擎
- [cytoscape-fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) — 力导向布局
- [Vite](https://vite.dev/) — 构建工具

## 项目结构

```
├── index.html              # 入口 HTML
├── vite.config.js          # Vite 配置
├── package.json
└── src/
    ├── main.js             # 应用入口，组件初始化
    ├── store.js            # 数据状态管理（节点/边/撤销栈）
    ├── graph.js            # Cytoscape 图渲染、布局、高亮
    ├── editor.js           # 内联编辑、键盘交互、撤销重做
    ├── ui.js               # 侧边栏面板、树形列表、搜索
    ├── api.js              # 后端 API 通信
    ├── storage.js          # localStorage 读写
    ├── styles.css          # 全局样式
    └── data/
        ├── defaultGraph.js       # 默认图谱数据（红楼梦）
        └── defaultGraph.raw.js   # 原始节点/边定义
```
