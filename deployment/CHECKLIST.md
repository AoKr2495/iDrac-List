# NAS 部署一页清单

完整命令、异常处理、升级与回退见 NAS_DEPLOYMENT.md。

## 联网侧交付

- [ ] GitHub Actions 对应提交构建成功，下载 offline-amd64 完整离线包。
- [ ] 镜像已通过 Linux amd64 架构、容器启动、业务与重启持久化测试。
- [ ] ZIP 和 SHA-256 文件齐全，不用 GitHub 源码 ZIP 替代镜像包。
- [ ] 确认包内无 Mac 业务数据、历史、日志、.venv、node_modules 或缓存；Data/Logs 为空。

## NAS 准备

- [ ] Container Station / Docker 已运行；NAS 架构 x86_64。
- [ ] 磁盘、NAS 时间、内网连通、8088、防火墙均确认。
- [ ] 解压后路径正确，隐藏文件 .env 未遗漏，文件校验通过。
- [ ] 记录应用账户 UID/GID；Data/Logs 写权限、配置读权限与 ACL 正确。
- [ ] .env 镜像名保留发布值；端口/UID/GID已替换，config.yaml 路径与挂载一致。

## 启动与验收

- [ ] docker load 导入镜像；使用 compose.offline.yaml，禁止 build/pull。
- [ ] 容器 running/healthy，浏览器 NAS_IP:端口可访问，首次数据为空。
- [ ] 两客户端 SSE、唯一性、Status History、Validation/返工、删除审计正常。
- [ ] 容器重启后数据、历史、排序恢复；确认备份覆盖配置/Data/Logs。
- [ ] 记录镜像标签/提交/校验值/路径/UID/GID/验收日期。
- [ ] 保留旧版本镜像和备份，避免升级时覆盖现有 Data/Logs/config。
