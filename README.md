# iDrac-List V1

React + TypeScript / FastAPI / SQLite，单进程同源提供 UI、HTTP API、SSE。默认 http://localhost:8088 。业务依据见 SPECIFICATION.md；没有登录，按已确认范围用于可信内网。

## Mac 本地运行

需要 Python 3.12、Node 24、pnpm 11.25.0。所有命令在本项目目录执行。当前已安装的环境可直接 `./scripts/start.sh`。

首次安装与构建：

```sh
mkdir -p .cache
python3.12 -m venv .venv
TMPDIR="$PWD/.cache" PIP_CACHE_DIR="$PWD/.cache/pip" .venv/bin/python -m pip install -r requirements.lock
pnpm --dir frontend install --frozen-lockfile --store-dir "$PWD/.cache/pnpm-store"
pnpm --dir frontend --store-dir "$PWD/.cache/pnpm-store" run build
./scripts/start.sh
```

若电脑无默认 Node/Python，请使用已有运行时的绝对路径或加入 PATH，无须全局安装。前端构建产物由 FastAPI 同源提供；开发热更新可在后端运行同时执行 `pnpm --dir frontend run dev`，API 代理至 8088。

## 本地测试

```sh
TMPDIR="$PWD/.cache" .venv/bin/python -m pip install -r requirements-dev.txt
TMPDIR="$PWD/.cache" .venv/bin/python -m pytest --basetemp=.cache/pytest
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/browsers" pnpm --dir frontend exec playwright install chromium
```

端到端使用专门测试服务 8089，不污染正式 Data/。创建项目内 `.cache/test-config.yaml`，内容使用 server.port: 8089、server.host: 127.0.0.1、storage.data_dir: ./test-data、storage.logs_dir: ./test-logs；路径相对该配置文件：

```sh
.venv/bin/python -m backend --config .cache/test-config.yaml --initialize-empty-data
# 另一个终端
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/browsers" pnpm --dir frontend exec playwright test
```

浏览器结果、截图与 trace 位于 .cache/。测试使用独立编号，可以重复执行。

## 数据、审计与恢复

config.yaml 在启动时读取；默认 Data/idrac-list.sqlite3，Logs/Timeline/YYYY-MM.log 和 Logs/Delete/YYYY-MM.log。所有修改在 SQLite BEGIN IMMEDIATE 事务中完成；唯一业务键跨 Active/History；Status 保存按操作 ID 防重。删除为不可编辑墓碑，释放业务键，但保留不可变删除快照、关联操作和所有 Status 记录。
事务同时提交业务数据、审计、日志待输出事件；日志导出失败在后端记录错误并重试。`GET /api/health` 的 pending_logs 可供运维检查，不向前端提供审计文件入口。重启继续导出，事件 ID 防止重复；异常未完成行在重放时修复。NAS 文件系统需为容器本地挂载的存储，数据库文件不可跨多个实例共享。

改数据目录只切换，不自动搬数据。停服后完整复制数据目录（含 SQLite 辅助文件），修改配置并重启。全新非默认目录需显式 `--initialize-empty-data`，避免误初始化。修改日志路径或数据路径时须更新 Git 排除和容器挂载；Data/、Logs/、SQLite 及缓存不上传。当前没有创建 GitHub 仓库或推送。

## QNAP x86-64 部署准备（未执行）

Dockerfile 为多阶段构建，最终镜像单容器、非 root、仅 Python 和构建后的静态文件。compose.yaml 使用 8088 和持久挂载。NAS x86-64 上原生构建，或 Mac 用 Docker buildx 指定 linux/amd64；不将本机 ARM64 .venv/node_modules 复制到镜像。
部署前按 NAS 用户填写 APP_UID/APP_GID 并为 Data/Logs 赋相匹配的写权限（勿用全员可写），确认配置/挂载路径。改端口需同时调整 config、Compose 和健康检查。获用户批准后才执行：

```sh
APP_UID=1000 APP_GID=1000 docker compose up -d --build
```

备份/恢复使用 NAS 机制，先停止容器，再整体备份配置、Data/ 和 Logs/；V1 不含应用自动备份。当前环境没有 Docker，因此尚未验证镜像构建与 QNAP 实机运行，不把配置审阅当成部署测试。

## HTTP 接口

- GET /api/state：事务一致快照，含 revision 和 NAS 显示时区。
- GET /api/events：SSE state 事件/15 秒心跳，含 revision。重连先全量拉取成功再恢复写入。
- GET /api/pkf/normalize?value=468&year=26。
- POST /api/servers：pkf、sn、operation_id。
- POST /api/servers/{id}/edit：generation、changes（单字段 sn/model/os）。
- POST /api/servers/{id}/status：generation、text。
- POST /api/servers/{id}/progress：generation、stage（0–4）、state，Validation 需 confirmed=true。
- POST /api/servers/{id}/return 或 /delete：generation、confirmed=true。
- POST /api/pkfs/{pkf}/position：position（Pinned/Normal/Bottom）。

所有写请求需 operation_id，逻辑重试沿用，独立操作换新 ID。可带匿名 X-Client-ID/X-Request-ID，不代表认证。完成/返工递增 generation，旧生命周期请求拒绝；同代次同字段按最后提交生效。

## 验收后：修改 PKF 前缀与 Validation 提醒

只需编辑 `config/pkf.json` 与 `config/validation_reminders.json`。详细格式和生效步骤见 [业务配置说明](config/README.md)。改成 PKF27GR 时不填写末尾 00；旧数据不变。提醒仅作文字提示，不是 Checklist。修改后重启服务并刷新浏览器，不用重编译前端。Docker 已增加整个 config/ 的只读挂载，修改后也只需重启。

## GitHub 与完全离线 NAS 交付

仓库：https://github.com/AoKr2495/iDrac-List 。main 提交触发 GitHub Actions：后端测试 → 构建 linux/amd64 单容器镜像 → 容器启动/重启持久化验证 → 导出镜像 → 生成完整文件夹 ZIP（不含业务数据/日志）。在成功运行的 Artifacts 下载 iDrac-List-offline-amd64。

NAS 使用 **compose.offline.yaml** 和包内 .env，不执行 build/pull，也不需要连接 GitHub。普通 compose.yaml 仍供联网侧源码构建使用。完整步骤见 [NAS 部署手册](deployment/NAS_DEPLOYMENT.md)，打印核对见 [一页清单](deployment/CHECKLIST.md)。GitHub 源码 Download ZIP 不含镜像，不能视为完全离线包。

## PKF 备注

备注位于卡片 PKF 单号右侧，同一行不增加高度。Active 失焦或 Enter 自动保存，Escape 撤销本次未提交输入；History 只读，返工后保留。未创建正式 Server 的临时空组先添加 Server 才可保存备注。备注支持多用户 SSE 同步并写操作审计。

本地开发新版启动时会在事务内把 schema 1 数据库原地增加默认空 note 字段至 schema 2，保留既有业务与审计。更新 NAS 前仍按部署手册停服、备份配置/Data/Logs，再使用包含本功能的新镜像；之前已生成的离线包不会自动获得此功能。

API 新增 POST /api/pkfs/{pkf}/note，内容为 operation_id、text；只对有 Active Server 的正式 PKF 生效。

## 1.0.1：HTTP 白屏修复 + PKF 同行备注

UUID 已改为统一 getRandomValues 实现，支持局域网 IP + HTTP 非安全上下文，不要求 HTTPS。完整回归与保留 NAS 现有数据的换镜像步骤见 [1.0.1 更新说明](deployment/UPDATE_1.0.1.md)。本版包含备注字段的兼容性添加，首次启动自动追加空字段；不要将新包空 Data/Logs 覆盖正式目录。
