# 汉广

一款任务导向、带有游戏成就反馈的个人自学计划桌面应用。

## 已实现

- 导入 Markdown 计划书，按任务数量自动拆分并分配到每天
- 单击今日任务或计划卡片，在独立详情窗口查看完整信息
- 无需联网的本地列表解析，以及可选的 DeepSeek 智能任务拆分
- 按开始日期与目标日期排期，并可重新分配剩余任务
- 计划删除及对应任务、成就记录的级联清理
- 必须由本人确认任务完成，随后记录成就、展示桌面弹窗并播放翻页式解锁音效
- 成就按解锁月份归档展示
- 本地保存任务与成就；DeepSeek API Key 使用操作系统安全存储加密

## 运行

```powershell
npm install
npm run dev
```

生产模式：

```powershell
npm run build
npm start
```

## Markdown 计划书

推荐使用 Markdown 列表编写任务：

```markdown
# 高等数学第一章

- 理解数列极限定义
- 完成习题 1—10
- 整理错题与总结
```

导入时计划名称自动采用文件名，并默认启用 DeepSeek 智能拆分；本地模式则直接读取列表项。

## DeepSeek 配置

打开左下角“DeepSeek 设置”，填写 API Key 和模型名。接口固定为官方 `https://api.deepseek.com/chat/completions`；已保存的 Key 会以脱敏形式显示。默认模型为 `deepseek-chat`，如果你的 V4 API 使用专属模型标识，请以服务商提供的名称替换。

任务与设置保存在 Electron 的 `userData` 目录，不会写入项目仓库。
