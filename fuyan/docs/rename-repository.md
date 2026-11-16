# 仓库改名为 zailao-app（已完成）

项目显示名称为「再捞我一下」，GitHub 仓库名为 `zailao-app`。

- 新地址：https://github.com/makainuo/zailao-app
- 旧地址：https://github.com/makainuo/fuyan-app （GitHub 网页会重定向，但 jsDelivr 不一定）

## 2026-11-16 已完成

1. GitHub 仓库名 `fuyan-app` → `zailao-app`，默认分支仍为 `master`；
2. 仓库内 `README.md`、`version.json`、`dist/archives.json`、`tools/publish-github.ps1` 的地址全部改为新仓库；
3. 软件设置：`update.repo = makainuo/zailao-app`，在线清单改为
   `https://raw.githubusercontent.com/makainuo/zailao-app/master/fuyan/dist/archives.json`；
4. 新建 `v0.1.3` Release（资产 `zailao-v0.1.3.zip`），并把 v0.1.1 / v0.1.2 的标题改为「再捞我一下」；
5. 实测：更新检查 0.1.3、在线清单 2 门课、课程包可下载导入。

## 给后来者

- 仓库内 `fuyan/` 路径继续保留，用于兼容原发布布局；仓库改名不影响 `fuyan/archive@1`、`%APPDATA%\fuyan`、题目 id 和内部 API。
- 改名后要同时改 **GitHub 网页地址、raw 地址、jsDelivr 地址、软件 `update.repo`、在线清单里的课程包 URL** 五处，只改网页地址会出现“网页能开、CDN 404”。
- 如果再次改名：改名 API 返回 403/404 说明当前连接没有仓库管理权限；此时保留仍可访问的旧地址，不要发布尚不存在的新地址。
