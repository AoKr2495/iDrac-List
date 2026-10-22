# 1.0.1 修复与发布测试报告

本版包含 HTTP 非安全上下文 UUID 修复和最新 PKF 同行备注，用户已授权一起 push GitHub 并交付完整 amd64 离线包供确认。本次不连接 NAS、不执行部署、不清空或搬迁 NAS Data/Logs。

## 修改文件

- frontend/src/uuid.ts：getRandomValues 生成 RFC UUID v4，统一版本位/variant 位和格式，不调用 randomUUID，不用 Math.random。
- frontend/src/api.ts：客户端 ID、操作 ID、请求 ID 三个直接调用全部替换为 uuidV4；原请求幂等、LWW、生命周期规则不变。
- frontend/e2e/http-lan.spec.ts：真实 HTTP IP 非安全上下文回归与 10,000 UUID 样本测试；测试源通过本机转发代理，仅连接隔离服务。
- frontend/e2e/workspace.spec.ts：测试辅助 ID 同样使用统一 UUID；保留 PKF 备注布局和协作回归。
- frontend/playwright.config.ts：允许 CI 选择最终容器端口，默认仍为隔离本地测试端口。
- .github/workflows/offline-release.yml、scripts/prepare_upgrade_fixture.py、scripts/container_smoke.py：增加最终 Linux amd64 容器上的 HTTP 回归及旧库升级/重启持久化测试，数据均为 CI 自建测试数据。
- PKF 备注相关 backend/store.py、app.py、frontend/src/main.tsx/types.ts/style.css、tests/test_pkf_notes.py：本地已确认的同行备注、共享持久化、审计、只读 History、返工保留；本版一并发布。
- VERSION/.env.example、deployment/UPDATE_1.0.1.md 与规范/说明文件：版本和保留现有数据的升级指引。

## 本地验证结果

- 44 项后端测试通过。
- 11 项浏览器测试通过；新增 HTTP+备注保存测试另行复测通过。
- HTTP 测试明确断言 isSecureContext=false、crypto.randomUUID=undefined、getRandomValues 为函数；首屏、SSE、新增、Status、备注保存、主题跨刷新和全部 ID 格式均通过。
- 10,000 UUID 均符合 v4/variant 格式且未发现重复。
- TypeScript 严格检查、Vite 生产构建通过。
- 代码审查未发现生产源码中剩余 randomUUID 直接调用，未使用 Clipboard/ServiceWorker/WebShare/媒体权限/文件选择器等安全上下文专属 API。现有浏览器支持范围不变。
- 旧 schema 1 示例业务数据升级为 schema 2 后，Server、History、Status、排序和 revision 比对一致。此为隔离测试，不是对 NAS 的操作。

## 数据兼容与交付边界

备注需要给 PKF 表增加默认空 note 字段，新版在你批准更新并首次启动时事务升级；不重建、清空或搬迁数据目录。升级前按既有流程停服备份，继续使用原 Data/Logs 和配置挂载。完整包默认附带空 Data/Logs 供首次安装，不能拿这些空目录覆盖正式 NAS。详见 UPDATE_1.0.1.md。

Linux amd64 镜像与容器验证结果以对应 GitHub Actions 成功运行和离线包校验为准；不会将本地前端构建替代 Docker 验证。NAS 实机更新由用户确认后自行进行。
