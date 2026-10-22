# iDrac-List V1 本地开发交付报告

日期：2026-10-22。依据：用户已审核规范报告并批准完整本地开发；业务基线为 SPECIFICATION.md。当前可运行版本已启动于 http://localhost:8088 ，默认数据库为空；浏览器测试仅使用独立 8089 服务及 .cache/ 测试数据。

## 阶段一：基础架构、数据库与 API

已实现 FastAPI 同源服务、SQLite WAL、后端事务、单一 Server 主记录和生命周期代次。PKF+SN 在 Active/History 通过数据库联合唯一索引保证；删除墓碑不占业务键且旧 ID 不可复活。写请求按操作 ID 幂等，同代次同字段为最后成功提交生效。

Status 有正式业务历史表，首次空白 Save 无业务写入，后续空白或同文 Save 各追加一次；逻辑重试不重复。Progress 仅存当前阶段/状态；Validation 和返工事务更新同一主记录，完成时间来自后端，Status History 不丢失。已完成/已删除/旧代次请求拒绝。PKF 排序偏好持久保存。

审计、删除完整快照与日志待输出事件随业务事务提交；审计和删除快照数据库触发器禁止更新/删除。后台写月度 Timeline/Delete 日志，文件失败重试、事件 ID 防重、修复中断的末行。已提交快照不会因文件导出失败丢失。审计无前端访问 API，不记录浏览。

阶段测试：25 项后端测试全部通过，含并发创建/Status、数据库直接唯一约束、事务回滚、日志失败与崩溃重放、历史冲突、空字段、真实 uvicorn 进程重启等。测试工具有一条 Starlette 关于 httpx TestClient 的弃用提示，不影响测试通过；生产不依赖测试客户端。

## 阶段二：前端与 SSE

已实现 React/TypeScript 两页 Group/Table、三区排序、PKF 简写定位、SN 失焦/Enter、Model/OS 即选即存、Status 编辑和只读倒序历史、单层五阶段 Progress、Validation 及动画/Toast、History 确认返工、Active 确认删除和重复历史记录的限定选项。

B1 SVG 仅图形，UI 独立显示名称；Lucide 统一 Registry。手动 Light/Dark 在浏览器保存，不跟系统。白色 Status、黑色 Not Started 在两种主题保留。侧栏展开/折叠/隐藏，竖屏小按钮，表格保留水平滚动。

SSE 含 revision、15 秒心跳；断线只读，退避重连后完整重新拉取才恢复编辑。未提交 SN 草稿在标签内保护；普通远端更新不覆盖，生命周期失效草稿脱离行并可复制，禁止自动重建。失败请求保留输入和可重试操作 ID。

阶段测试：7 项真实 Chromium 端到端测试全部通过，覆盖：

1. 全流程新增、字段、首次/后续空白 Status、进度跳转、Validation 取消/完成、返工。
2. 双浏览器客户端 SSE、草稿保留、断线禁写、恢复最新数据后提交。
3. History 重复提示/三个限定选项、删除取消与确认、删除后拒写。
4. 完成后返工的旧 Status 弹窗仍拒绝保存。
5. 手动双主题跨刷新持久化、侧栏操作和截图。
6. 1080×1920 竖屏展开按钮。
7. PKF 置顶/沉底切换、刷新保留及定位后最后一行完成的空组消失。

测试发现并修复底部长页面操作菜单超出视口、已定位的临时 PKF 不应阻止空组消失等问题。最终浏览器控制台未在主流程测试发现未捕获错误。1920×1080 Light/Dark 截图已检查，位于 .cache/active-light.png 与 .cache/active-dark.png。

## 阶段三：本地运行与部署准备

TypeScript 严格类型检查和 Vite 生产构建通过。默认 8088 服务首页、状态和健康检查均 HTTP 200，health 为 ok / revision 0 / pending_logs 0（启动验收时）。用户正式数据没有混入测试样本。运行说明及一键启动脚本见 README.md、scripts/start.sh。

Dockerfile 为 Node 前端多阶段构建 + Python 3.12 最终镜像，非 root、单容器、持久目录与健康检查；compose.yaml 提供配置/Data/Logs 挂载、8088、重启策略。Python 运行依赖完整固定于 requirements.lock，前端完整固定于 pnpm-lock.yaml；Linux x86-64 的全部 Python 运行依赖包已成功下载检查。

限制：当前 Mac 无 Docker 命令，未执行镜像构建或 Compose 实际启动；未连接 NAS，未验证 QTS 实机权限、文件系统、浏览器 Edge 或 NAS 重启。依赖包可下载不等于镜像/NAS 已验证。没有推送 GitHub，也没有部署 NAS。

## 文件清单

- backend/config.py、store.py、app.py、__main__.py：配置、数据库、业务事务、HTTP/SSE、启动。
- frontend/src/{main.tsx,api.ts,icons.tsx,types.ts,style.css}：React UI、连接/保存、图标与样式。
- frontend/package.json、pnpm-lock.yaml、pnpm-workspace.yaml、tsconfig.json、vite.config.ts、index.html：锁定依赖和构建。
- tests/test_core.py、test_restart.py、conftest.py；frontend/e2e/workspace.spec.ts、playwright.config.ts：后端、真实进程、真实浏览器测试。
- requirements.txt、requirements.lock、requirements-dev.txt、config.yaml、Dockerfile、compose.yaml、.gitignore、.dockerignore。
- README.md、scripts/start.sh、scripts/verify.sh：使用和本地验证。
- 六份原规范文件与 REVIEW_REPORT.md 已同步当前开发授权及状态，四份 B1 图形 SVG 保持确认版本。

Data/、Logs/、.cache/、.venv/、node_modules/、前端构建产物及 Python 缓存均不属于源码交付。改运行目录时按 README 更新 Git 排除与挂载，不把 SQLite 或日志上传。

## 路径问题记录

首次浏览器测试两张截图使用 ../.cache 相对路径，误写到父目录 /Users/macpal/Workspace/projects/Qnap_iDrac/.cache/active-light.png、active-dark.png。已改成从测试源文件计算的项目内绝对路径并重新生成。为遵守仅在项目内修改/删除的边界，没有擅自清理父目录中的这两张旧截图；未触碰父目录其他文件。此疏漏不涉及数据库或业务文件，已向用户说明。

## 下一步

用户可在本地 8088 验收实际流程；出现缺陷按原规则修复，新增需求歧义先询问。GitHub 交付和 QNAP 部署待用户另外批准；在有 Docker 的环境验证镜像/Compose 后才能宣称 NAS 部署就绪。当前没有新增业务规则待确认问题。


## 整体验收后：两项配置维护扩展

用户已确认整体功能验收通过，并要求 PKF 默认补全与 Model–OS Validation 提醒独立维护，现已实现。

- 新增 config/pkf.json：default_prefix 默认 PKF26GR，未来改 PKF27GR；编号仍为五位补零。旧编号和明确带年份/大小写简写均兼容。配置年份与已有业务最大年份共同决定无标签上下文时的补全年份，旧 26 年数据不会覆盖新 27 配置。
- 新增 config/validation_reminders.json：通用数组和 6×3 精确映射，18 个空组合；Validation 原文之后显示提醒，无需勾选，不阻塞无 Model/OS 的完成，不增加 Checklist 数据。
- 新增 config/README.md：完整编辑例子、匹配规则、生效方式；根 config.yaml 增加 business.config_dir。Dockerfile 复制 config/，Compose 增加整个目录的只读挂载。
- 配置启动校验并加载，修改后重启服务和刷新浏览器生效，不必构建前端；缺失/格式错误明确拒绝启动。文本按普通字符串渲染，不执行脚本或 HTML。
- 同时修复长页面滚动事件过早关闭进度菜单的问题；仍可点外部或 Escape 关闭。

验证：35 项后端测试、8 项 Chromium 端到端测试全部通过；TypeScript 与生产构建通过。新增配置 UI 测试使用替换的 state 配置验证前端；后端另用真实临时配置文件验证读取、27 年补全、26 年兼容、提醒与空字段 Validation，以及非法配置和重启生效。

8088 服务已重启，业务 Server/PKF 偏好/业务版本的重启前后摘要一致；正式提醒配置仍为空，未填任何业务检查内容。测试服务/数据与正式工作区分离。没有推送 GitHub 或部署 NAS；Docker 仍不可用，挂载配置未在 Docker 中实际运行。
