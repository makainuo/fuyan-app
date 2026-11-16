# Windows 品牌与启动改动核验

## 已完成

- 应用的 JavaScript/ES module 文件通过 `node --check`。
- PowerShell 工具脚本通过语法解析；窗口属性 C# 组件通过 Windows PowerShell `Add-Type` 编译。
- SVG 图标生成工具成功生成 12 个原生尺寸 ICO。
- 清空 PATH 后，新名称 VBS/BAT 与旧名称兼容启动器均能找到便携 Node。
- 通过新 VBS 启动全新本地服务，使用隔离数据目录与独立端口，没有读取真实用户配置。
- 首页名称、SVG、ICO、CSS 返回正常；导入公开的传染病学和消化系统存档，题量分别为 196、63，导航锚点存在。
- 确认最新上游阅读器的书签、可展开目录及主题同步实现仍保留；Word/PPT/Markdown 转存档工具未被旧发布包覆盖。
- 本轮本机使用中，用户确认捕获黄框关闭、任务栏图标变清晰；相关截图捕获已停止，验证不依赖再次开启捕获。

## 限制

尝试执行根目录 Android 项目的 `gradlew.bat testDebugUnitTest`，环境缺少 Java/JAVA_HOME，未能启动 Android 测试。本次没有修改 Kotlin、Android 资源或 Gradle 配置；此限制不能表述为 Android 测试通过。

第一次无 PATH 的端到端验证暴露了 zip 导入依赖裸 `powershell.exe` 的问题，现已改用 SystemRoot 下的系统 PowerShell 绝对路径，并重新验证导入成功。

## 发布边界

提交最终源码、Logo、图标资源和可复现工具，不包含本机配置、密钥、批注、对话、做题进度、Node 可执行文件或界面捕获资料。版本为 Windows v0.1.3，旧数据格式和目录继续兼容。
