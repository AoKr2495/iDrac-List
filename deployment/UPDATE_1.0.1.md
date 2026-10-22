# iDrac-List 1.0.1 更新与保留数据的升级步骤

本版本包含：HTTP 局域网 IP 白屏修复，以及已确认的 PKF 单号右侧同行备注功能。用户已明确要求将两项一同发布并 push GitHub。只交付镜像供用户确认，本次未连接/操作 NAS。

## 修改与验证范围

- frontend/src/uuid.ts 统一 UUID v4，使用 crypto.getRandomValues 的 16 个随机字节，设置版本/variant 位。客户端 ID、操作 ID、请求 ID 均经此封装，不使用 Math.random 或 HTTPS 专属 randomUUID。
- 已审查浏览器 API：未使用 clipboard、Service Worker、Web Share、媒体设备/文件选择器等安全上下文限定功能。现有 fetch、EventSource、localStorage、matchMedia、dialog、AbortSignal.timeout 无 HTTPS 前提，仍以既定 Chrome/Edge 为支持范围。
- HTTP 回归使用测试保留 IP 192.0.2.205 + HTTP，经本机代理连接隔离测试服务，**不访问真实 NAS**。断言 isSecureContext=false、randomUUID 不存在、getRandomValues 可用；验证首屏、SSE、Server 创建、Status 保存、主题及请求 UUID 格式。
- 10,000 UUID 样本验证格式、v4/variant 位和不重复。CI 会对最终 Linux amd64 镜像重跑 HTTP 回归和容器业务/持久化检查。
- PKF 备注沿用已确认布局和交互：单号右侧同行，不增加卡片行高，Active 失焦/Enter 保存，History 只读，返工保留，具备事务审计和 SSE/草稿保护。

参考：[randomUUID 的安全上下文要求](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)、[getRandomValues 可用于非安全上下文](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)。

## 与旧数据库兼容

包含 PKF 备注意味着数据库需要增加字段：程序首次启动在 SQLite 事务内执行 schema 1 → 2，给 pkfs 增加默认空 note。**这不是搬迁目录、清库或初始化新工作区**；既有 Server、Status History、历史完成记录、排序、审计和日志保留。迁移代码已在旧结构测试中核验。

本次没有在 NAS 上执行迁移，迁移会在你确认采用并启动新镜像时发生。请先按既有运维方式停止服务并一致性备份配置/Data/Logs；若不准备采用包含新字段的版本，暂不替换镜像。不要使用 --initialize-empty-data。

## 更新 NAS：只换镜像，保留原挂载和业务目录

1. 将新版 offline-amd64.zip 放入 NAS **新的临时目录**解压并检查 SHA256SUMS。不要覆盖当前正式运行目录，不要把包内空 Data/Logs 复制到正式目录。
2. 记录旧 IDRAC_IMAGE、APP_UID/GID、端口、四个挂载路径，保留旧镜像和 .env；在维护窗口停止旧容器，并用既定 NAS 备份方式保存 config.yaml、config/、.env、整个 Data/Logs。
3. `docker load -i 新包解压目录/image/idrac-list-amd64.tar` 导入新版镜像。
4. 在**现有正式目录**的 .env 中只更新 IDRAC_IMAGE 为新包 .env 内精确镜像名。保留现有 UID/GID/端口/config 和全部原挂载路径；不要改 storage.data_dir，不复制包内新工作区。
5. 在现有正式目录执行：

```sh
docker compose --env-file .env -f compose.offline.yaml up -d --no-build --pull never
```

若原本使用 GUI/docker run，只替换镜像，保留原身份、端口和挂载；不要创建第二个实例共用数据库。

6. 查看启动日志和 /api/health，确认无迁移/权限错误，再用原 NAS HTTP IP+端口访问。Ctrl/Cmd+Shift+R 强制刷新使新 JS 生效；确认 Console 无 randomUUID 错误，旧记录完整，备注可保存并同步。
7. 验收失败先停新容器，保留当前数据副本，按原部署手册使用已备份配置/数据及对应旧镜像回退；不要删除正式目录或初始化新库。

**不执行 down -v，不清空/搬迁 Data/Logs，不覆盖 NAS 已填写的 PKF/Validation 配置。** 本版本包中的空 Data/Logs 仅供首次部署使用，升级必须继续挂载原目录。
