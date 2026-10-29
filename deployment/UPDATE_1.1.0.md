# iDrac-List 1.1.0 离线升级与回退

本版新增 Active 全局手动排序及 Packing 工作区。仅在取得对应版本、通过测试的完整 offline-amd64 包后执行；源码 ZIP 不是离线镜像包。本文不表示已替用户操作 NAS。

## 变化和迁移

- 正常流程 Active→Validation Success→Packing→Packing Success→History。Packing Status可编辑，返工保留身份/历史并重置Active进度。
- Active Sort PKFs仅在独立弹窗编辑，Save生效，Cancel/关闭不保存；过期版本需Reload。空卡片不参与正式排序。
- 支持Schema1/2→3。第一次启动在事务中扩展生命周期约束、增加进入Packing时间和排序表；旧Active顺序按原三区及编号初始化。保留旧History、备注、Status History、身份、审计和配置。
- **旧镜像不能直接读取Schema3。回退必须恢复升级前一致性数据库备份，不能只切换旧镜像。** 备份后新产生的数据不会自动合并到旧备份。

## 升级前清单

1. 通知所有用户暂停写入；记录旧镜像标签、容器名、运行目录、Compose文件、端口、UID/GID、数据/日志真实挂载位置、所有配置和当前健康状态。
2. 在NAS停止当前应用容器，等待正常退出。不要清理卷或镜像。
3. 用NAS现有备份功能或文件管理工具，将停止后的整个Data、Logs、config.yaml、config/、.env、Compose及版本信息复制到**独立备份位置**。SQLite如存在-wal/-shm一并备份；不要只复制运行中的主库。确认备份可读且空间足够。
4. 保留旧镜像以及与备份对应的旧版程序和Compose。不要运行`down -v`，不要使用空库初始化参数。
5. 将新ZIP复制到NAS并在**另一个目录**解压，不能解压覆盖原运行目录。对照外部.sha256和包内SHA256SUMS校验。新包空Data/Logs不可复制到正式目录。

## 导入与启动

以下命令中的路径按实际位置填写；先在新包目录验证，再回到原运行目录操作。保留现有Compose与配置挂载。

```sh
# 新包目录：校验内部文件并离线加载
sha256sum -c SHA256SUMS
docker load -i image/idrac-list-amd64.tar
```

查看新包release-manifest.json或新包.env中的确切image_tag。只修改**原运行目录**已有.env的IDRAC_IMAGE为此标签，保留APP_UID/APP_GID/IDRAC_PORT；不直接用新包默认.env覆盖。保留原config.yaml与config/，包括自定义数据路径，确认Compose指向原持久化目录。

```sh
# 原运行目录
 docker compose --env-file .env -f compose.offline.yaml up -d --no-build --pull never
 docker compose --env-file .env -f compose.offline.yaml ps
 docker compose --env-file .env -f compose.offline.yaml logs --tail 100
```

如NAS安装的是旧式Compose，使用同等参数的docker-compose。无需访问GitHub、镜像源、npm或PyPI。运行期没有外部联网依赖。首次启动自动执行Schema3迁移，失败应停止排查，不能初始化空库绕过。

## 升级后验证

- 健康接口http://NAS_IP:8088/api/health正常，浏览器硬刷新后能通过HTTP IP正常显示三工作区。
- 对照升级前清单：旧Active分组顺序初始化正确；History数量、字段、备注、Status History未改变；旧日志仍存在。
- Sort PKFs：备注展示、鼠标/键盘排序；Cancel不变、Save同步；两客户端旧草稿保存被拒绝并可Reload；刷新后保留。
- 用经批准的测试记录验证Validation→Packing、Packing Status保存、Packing Success→History、Packing及History返工；不要随意迁移真实工作记录。
- 两客户端能看到变更；离线只读与恢复重新拉取正常；Light/Dark正常。
- 在维护窗口重启容器，确认数据/排序/历史恢复、Timeline持续追加、权限无错误。验收后再恢复正常使用。

## 失败回退

1. 暂停所有客户端写入，停止新版容器。保留故障日志和**新版**Data的独立副本，便于后续排查；不要覆盖升级前备份。
2. 确认升级前备份与旧镜像对应。将正式数据目录移到独立保留位置，再把完整升级前Data备份恢复到原路径；这一步由用户在NAS维护窗口操作，不能合并新旧SQLite文件。保留现有Logs及故障日志，按备份与审计策略保存升级后日志，不能删除/改写历史审计。
3. 恢复旧版.env镜像标签、原Compose和对应配置，确认UID/GID和挂载不变。必要时从旧离线包docker load旧镜像。
4. 使用同样的`up -d --no-build --pull never`启动旧镜像；核对健康接口、旧数据和历史。浏览器硬刷新。
5. 只有确认旧Schema恢复成功后才恢复业务。若无法证明备份完整，保持停机并排查，不以空库代替生产数据。

## 包内应有内容

Linux amd64镜像tar、源程序、前端构建、业务配置示例、离线Compose、.env、release-manifest.json、SHA256SUMS、本手册及空Data/Logs。不得含Mac业务库/日志/缓存/依赖目录。以发布测试报告中的确切提交、镜像标签、校验值和测试结果为准。
