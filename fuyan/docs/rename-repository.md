# 仓库改名为 zailao-app

项目显示名称为「再捞我一下」，用户选择的 GitHub 仓库名为 `zailao-app`。

仓库改名需要仓库管理员权限。具有 push 权限的协作者可以创建和合并 PR，但不能据此改名。改名应在 GitHub 确认成功后，再同步运行中的更新配置。

## 管理员改名后

1. 在 Settings → General → Repository name 将 `fuyan-app` 改为 `zailao-app`。
2. 确认新地址为 `https://github.com/makainuo/zailao-app`，并核对旧 GitHub 地址的重定向。
3. 更新 Git remote、README、版本清单、发布脚本中的仓库地址，以及软件设置中的 `update.repo`。
4. 将在线清单地址更新为新仓库的 `master/fuyan/dist/archives.json`，并更新清单内课程包的 raw/jsDelivr 地址。
5. 实测软件更新检查、在线课程清单和课程包下载；不要仅根据 GitHub 网页重定向推断 CDN 也会重定向。

仓库内 `fuyan/` 路径继续保留，用于兼容原发布布局；仓库地址改名不要求同步更改存档 schema、数据目录或内部 API。

## 当前发布前的原则

如果改名 API 返回 403/404，说明当前连接未获仓库管理权限。此时保留仍可访问的旧仓库更新与下载地址，避免发布尚不存在的新地址。
