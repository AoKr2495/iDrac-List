# iDrac-List V1：QNAP 离线部署步骤与清单

适用：QNAP TES-1885U / QTS 5.1.9.2954 / Xeon D-1521 / 64 GB / x86-64。用户已选择 **全新空工作区，仅复制程序与配置**。不迁移 Mac 的 Server、History、审计或日志。Mac 原数据保持不变。

## 1. 交付包是什么

完整离线包名为 `iDrac-List-<提交前12位>-offline-amd64.zip`，以及同名 `.zip.sha256` 校验文件。它在联网侧生成，包含已构建的 Linux x86-64 应用镜像，因此 NAS 无需 GitHub、镜像仓库、npm 或 PyPI 网络。

注意区分：GitHub “Code → Download ZIP” 或名字含 source-only 的包只有源码，不能在断网 NAS 上直接完成首次构建。完整离线包必须含 image/idrac-list-amd64.tar，且 release-manifest.json 的 kind 为 offline-linux-amd64。

解压后为一个 iDrac-List 文件夹，关键内容：

| 文件/目录 | 用途 |
| --- | --- |
| image/idrac-list-amd64.tar | 已构建并测试的 Linux amd64 Docker 镜像 |
| compose.offline.yaml | 只使用本地镜像，不 build、不 pull |
| .env | 此版本精确镜像名、运行 UID/GID、访问端口 |
| release-manifest.json / SHA256SUMS | 提交版本、镜像 ID、内部文件校验 |
| config.yaml | 主机/端口、目录、时区、业务配置目录 |
| config/pkf.json | 默认 PKF 年份前缀 |
| config/validation_reminders.json | 18 种 Model–OS 提醒槽位，默认空 |
| Data/、Logs/ | 空目录，首次启动后生成正式业务数据/日志 |
| backend/、frontend/、assets/、规范与测试文件 | 完整源码；Mac 虚拟环境与缓存不包含 |
| scripts/offline-start.sh | 导入镜像并以离线 Compose 启动 |

`SHA256SUMS` 在修改配置前核验；你之后编辑 .env/config 导致校验不同是预期现象，留存原包作为版本基准。

## 2. 获取完整离线包（联网的 Mac 上）

1. 打开 GitHub 仓库 AoKr2495/iDrac-List → Actions → Build and verify offline NAS bundle。
2. 选对应 main 提交的绿色成功运行；在 Artifacts 下载 iDrac-List-offline-amd64。
3. GitHub 下载外层 artifact ZIP，先解开外层；里面的 `...-offline-amd64.zip` 和 `.sha256` 才是项目交付物。
4. 在 Mac 校验：

```sh
# 进入这两个文件所在的目录
shasum -a 256 -c iDrac-List-<提交前12位>-offline-amd64.zip.sha256
```

把占位文件名替换成实际文件名。输出 OK 后，通过 SMB/File Station 或移动存储复制到 NAS。整个文件夹解压后的隐藏文件 `.env` 也必须复制；推荐直接复制 ZIP 到 NAS 再解压，避免漏掉隐藏文件。

Actions 中间构建产物保留 90 天；下载后保存一份长期归档。若构建红色失败，不把源码 ZIP 当成完成的离线包；应先修复/重跑构建。

## 3. NAS 准备清单

- [ ] QTS App Center 已安装并启动适用于本机的 Container Station。离线 NAS 若未安装，先通过另一台联网设备下载正确 QPKG 并在 App Center 手动安装；适配包由 QNAP 官方提供，不能把 Mac Docker 软件复制到 NAS。
- [ ] NAS 有足够磁盘空间容纳 ZIP、镜像 tar、Docker 解包后的镜像和后续 Data/Logs；以实际包大小计算，不只预留 ZIP 大小。
- [ ] 明确 NAS 的局域网 IP，客户端能访问它。
- [ ] 8088 未被其他应用使用；同一局域网设备能通过防火墙访问该端口，不需要公网端口转发。
- [ ] 确认 NAS 时间/NTP 正确；应用存 UTC，默认按 Asia/Shanghai 显示。
- [ ] 临时启用 QTS“控制台 → 网络和文件服务 → Telnet/SSH → 允许 SSH”，仅内网管理员使用。
- [ ] 用管理员权限通过 SSH 登录，确认以下命令可用：

```sh
uname -m
docker version
docker compose version
```

`uname -m` 应为 x86_64。本步骤要求 Docker daemon 正常及 Docker Compose v2。QNAP Container Station 3 对应 `docker compose`，不要只因找不到旧的 `docker-compose` 就认为没有 Compose。版本或 PATH 不同请参考本文末尾 QNAP 官方说明。没有 Compose v2 时可用第 8 节 docker run 方式。

## 4. 放置项目与核验文件

本文以共享文件夹 Container 内的 `/share/Container/iDrac-List` 为示例。通过 File Station 先确认共享目录实际名称；若不同，替换下文路径，不要直接使用不存在的路径。

1. 在 File Station 创建/选定 Container 共享目录，把交付包复制过去并解压。
2. 确保最终目录不是多套一层 `iDrac-List/iDrac-List`，根目录应直接看到 config.yaml、compose.offline.yaml、image/。
3. SSH 执行：

```sh
cd /share/Container/iDrac-List
ls -la
sha256sum -c SHA256SUMS
```

所有条目应为 OK。如 NAS 没有 sha256sum，在 Mac 完成外层 ZIP 校验并确认传输后的 ZIP 校验值一致；可用 NAS 提供的等价 SHA-256 工具。校验失败不要先启动，重新复制损坏文件。

## 5. 设置 UID/GID、端口及配置

### 5.1 文件权限

镜像默认用户 UID/GID 为 1000:1000，但 NAS 实际账户不一定是该编号。建议选择一个 NAS 本地专用账户来持有 Data/Logs，并查询：

```sh
id 你的NAS账户名
```

记录输出的 uid、gid，编辑根 `.env`：

```dotenv
IDRAC_IMAGE=idrac-list:1.0.0-交付包中的提交前12位
APP_UID=实际非零UID
APP_GID=实际GID
IDRAC_PORT=8088
```

**IDRAC_IMAGE 保留交付包原值，不照抄占位符。** 只改 APP_UID、APP_GID 和必要时 IDRAC_PORT。应用以此身份运行，避免 root。通过 QTS 权限界面让该账户能遍历项目目录、读取 config.yaml/config/，并读写 Data/Logs。

若以具备 chown 权限的管理员执行，可将下面 1000:1000 替换为刚查到的编号：

```sh
mkdir -p Data Logs
chown -R 1000:1000 Data Logs
chmod -R u+rwX,g+rX Data Logs
```

不要 chmod 777，不要对整个 NAS 递归改权限。若提示 Operation not permitted，用 QTS 管理员权限/共享目录 ACL 设置，不让应用改为 root 绕过权限。

### 5.2 应用配置

默认 config.yaml 可直接使用：容器内 host 0.0.0.0、port 8088、data_dir ./Data、logs_dir ./Logs、timezone Asia/Shanghai、business.config_dir ./config。

- 只想把访问端口改为 18088：只改 `.env` 的 IDRAC_PORT=18088，容器内部仍是 8088，健康检查不需改。浏览器访问 NAS_IP:18088。
- 不要把 server.host 改为 127.0.0.1，否则容器端口可能无法从外部访问。
- 首次部署建议保持容器内 Data/Logs 路径，需放到其他 NAS 共享位置时改 Compose 挂载左侧宿主路径，保留右侧 /app/Data、/app/Logs。
- PKF27GR 的切换只改 config/pkf.json，不填写末尾 00。
- Model–OS 提醒按 config/README.md 填写，目前 18 个组合全空；它只是提示，不是必勾 Checklist。

配置改后重启并刷新浏览器生效。基础配置不得写入不存在且未挂载的目录，避免重建容器后“数据丢失”的误会。

## 6. 首次离线启动（推荐 Compose）

在项目目录执行：

```sh
sh scripts/offline-start.sh
```

脚本只在 NAS 执行；不会连接 GitHub，不会 build/pull，不会删除/清空 Data/Logs，不会自动替你递归改权限。它等价于：

```sh
docker load -i image/idrac-list-amd64.tar
docker compose --env-file .env -f compose.offline.yaml config
docker compose --env-file .env -f compose.offline.yaml up -d --no-build --pull never
docker compose --env-file .env -f compose.offline.yaml ps
```

`docker load` 应显示 Loaded image，名称对应 .env；不要用 `docker import` 替代，后者处理的是另一种文件格式/语义。

查看启动日志（这是容器运行输出，不是业务审计前端）：

```sh
docker compose --env-file .env -f compose.offline.yaml logs --tail=100
```

约 30–60 秒后容器应处于 running/healthy。通过同局域网 Chrome/Edge 打开：`http://NAS的IP:8088`，按实际 .env 端口替换。第一次为空 Active/History 属于预期。

## 7. 部署验收清单

- [ ] 首页显示 Live · NAS；Active/History 初始为空，未带入 Mac 测试/业务数据。
- [ ] 两台电脑/两个独立浏览器访问同一个 NAS_IP+端口，新增/改字段能实时同步。
- [ ] 测试 PKF 简写和重复定位；同 PKF+SN 重复拒绝。
- [ ] Model/OS、Status 非空/后续空白历史、Progress 跳阶段正常。
- [ ] Validation 二次确认后入 History，返工回原 PKF，Status History 保留。
- [ ] 主动删除测试行后二次确认，History 不新增该行，Logs/Delete 当月文件有完整快照。
- [ ] Logs/Timeline、Logs/Delete 中有当月 .log，Data/ 中有 SQLite 数据库和必要辅助文件；前端无日志入口。
- [ ] Light/Dark 手动切换后刷新保持；侧栏收缩/隐藏正常。
- [ ] 断开一台客户端网络显示离线只读；恢复后获取 NAS 最新数据，其他客户端继续工作。
- [ ] 在 NAS 端重启容器，业务数据/历史/PKF 排序仍在；NAS 整机重启验收放在可维护时段执行。
- [ ] 健康检查：

```sh
curl http://127.0.0.1:8088/api/health
```

应为 status: ok；若改外部端口则替换。pending_logs 短暂非零可为正在输出；持续增长需检查 Logs 权限/磁盘，数据库中审计仍保留待输出事件。

测试记录会作为正式业务保留审计，适量测试即可；不要为了“清除测试痕迹”删除正式数据库。

## 8. 无 Compose 或偏好 Container Station GUI

### 8.1 docker run 替代

先 docker load，并按第 5 节准备权限。把以下占位内容全部替换，不与 Compose 同时启动：

```sh
docker run -d --name idrac-list --pull never --restart unless-stopped \
  --user 实际UID:实际GID \
  -p 8088:8088 \
  -v /share/Container/iDrac-List/config.yaml:/app/config.yaml:ro \
  -v /share/Container/iDrac-List/config:/app/config:ro \
  -v /share/Container/iDrac-List/Data:/app/Data \
  -v /share/Container/iDrac-List/Logs:/app/Logs \
  交付包.env里的完整IDRAC_IMAGE值
```

之后用 docker logs idrac-list、docker restart idrac-list、docker stop idrac-list 管理；不要同时在 GUI 再建第二个实例挂同一数据库。

### 8.2 Container Station 图形界面

先按 CLI 的 docker load 导入镜像最明确。若该版本 Images 提供镜像 Import，可选择 image/idrac-list-amd64.tar；不要误选“容器备份导入”或把 ZIP 当镜像。
在已导入的**本地镜像**上 Create Container，名称 idrac-list；填实际 UID:GID，设置自动重启、主机8088→容器8088，挂载 config.yaml/config 只读、Data/Logs 可写，路径与上述 docker run 一致。确认使用已有镜像，不开启拉取最新版。

若用 Applications 的 Compose 编辑器：粘贴 compose.offline.yaml 后，将 .env 变量替换为字面值，且将四个相对挂载路径改成 NAS 绝对路径。GUI 工作目录不一定是你解压目录，不能直接假设 `./Data` 指向正确位置。不同 Container Station 版本入口可能不同，以已安装版本为准。

## 9. 后续修改、停止与升级

修改 PKF/提醒后：

```sh
docker compose --env-file .env -f compose.offline.yaml restart
```

刷新浏览器。停止服务用 stop，启动用 start；保留数据。不要执行 `down -v` 作为日常维护，更不能删除 Data/Logs。

升级流程：

1. 安排维护窗口并停止旧容器，按第 10 节备份。
2. 记录旧 .env 的镜像名/端口/UID/GID以及 release-manifest.json；保留旧镜像 tar 和旧包，不急于删除镜像。
3. 将新包解压到临时目录核验。保留现有 Data/Logs、config.yaml、config/ 和现有 UID/GID/端口；不要整文件夹覆盖已有配置或数据。更新代码/文档、compose.offline.yaml及新 image tar，.env 只将 IDRAC_IMAGE 改新包提供的精确标签，其他本地值保留。
4. docker load 导入新镜像，再执行 up -d --no-build --pull never，核对挂载仍为原目录，按第 7 节验收。
5. 只有确认新版本正常并完成后续备份后才清理不需要的旧镜像，不直接清数据库或日志。

V1 升级不自动搬迁数据；未来如有数据库迁移版本，必须按对应版本说明操作，不能假设任意新旧镜像都兼容同一数据库。

## 10. NAS 备份、恢复与回退

V1 不做应用内部自动备份。将配置、Data/、Logs/ 纳入 NAS 的快照/备份机制，并另存至少一份离机或其他存储的备份。
一致性备份步骤：停止容器 → 用 NAS 备份工具完整复制 config.yaml、config/、.env、Data/、Logs/、release-manifest.json → 记录对应镜像标签/镜像 tar → 启动容器。整个 Data/ 都复制，包含可能存在的 WAL/SHM 辅助文件，不能在线只复制 sqlite3 主文件冒充完整备份。

恢复：停止容器 → 先保留当前目录副本 → 恢复同一时点配置/Data/Logs → 校正 UID/GID 权限 → 导入对应版本镜像 → 启动并验收。日志为永久审计，保留恢复前的日志副本，避免丢弃备份时点后的操作痕迹。

回退：若数据库没有不兼容迁移，停止服务、把 .env 的 IDRAC_IMAGE 恢复旧标签后离线 up；如有不兼容迁移，必须同时恢复对应备份，不只换镜像。旧包/镜像未留存会使离线回退困难。

## 11. 常见故障

| 现象 | 检查与处理 |
| --- | --- |
| 提示拉取镜像/访问网络 | 是否用了 compose.yaml 而不是 compose.offline.yaml？是否缺 .env/镜像未 load？标签是否完全一致？勿在 NAS 执行 build |
| exec format error | 是否误用了 Mac ARM64 镜像？release-manifest 与 docker image inspect 必须 linux/amd64 |
| Permission denied / readonly database | 容器 UID:GID 与 Data/Logs 持有者及 QTS ACL 是否一致？挂载是否正确？磁盘是否满？ |
| 配置文件被建成目录 | 宿主 config.yaml 必须事先存在为文件，核对解压层级及挂载路径 |
| 非默认目录没有数据库而拒绝启动 | 默认目录不需初始化参数；改 data_dir 仅切换，不会搬数据，先迁移或明确使用初始化新目录参数 |
| 网页打不开但容器 running | server.host 要 0.0.0.0；确认端口映射/防火墙/正确NAS IP；看健康检查与容器日志 |
| 单次连接失败后离线 | 等待退避重连并确保 API/state 可读；不要把多个 NAS IP/不同端口当同一工作区 |
| 刚改提醒没有变化 | 重启服务并刷新浏览器；检查 Model/OS 大小写准确、JSON 格式、数组非空 |
| 数据看似丢失 | 先停新增，核对是否换了宿主挂载/目录/创建了第二容器，不要初始化或覆盖原数据库 |

## 12. 上线记录表

- NAS IP / 外部端口：________________
- NAS 项目绝对路径：________________
- QTS / Container Station / Docker / Compose 版本：________________
- APP_UID / APP_GID：________________
- 发布版本 / Git 提交 / 镜像标签与镜像ID：见 release-manifest.json，实际值：________________
- ZIP SHA-256 校验结果：________________
- 备份位置与计划：________________
- 首次上线时间 / 验收人：________________
- 跨客户端同步 / 重启持久化 / 审计落盘：________________

## 官方参考

Docker 镜像可通过 save 保存为 tar、load 从文件恢复，用于离线传输：[docker image save](https://docs.docker.com/reference/cli/docker/image/save/)、[docker image load](https://docs.docker.com/reference/cli/docker/image/load/)。离线 Compose 启动选项见 [docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)。
QNAP 的 Container Station 支持本地镜像与 Compose 应用，具体界面依版本而异：[Container Station Quick Start Guide](https://www.qnap.com/en/how-to/tutorial/article/container-station-quick-start-guide)。关于 QTS 5.1/Container Station 3 的 Compose 命令形式，见 [QNAP：为什么不能使用 docker-compose](https://www.qnap.com.cn/zh-cn/how-to/faq/article/why-cant-i-use-docker-compose-commands-in-container-station)。
