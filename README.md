# 拾级 · Achievements

一款受 Steam 成就与游戏解锁反馈启发的自学任务管理桌面应用。

## 已实现

- 粘贴计划书或导入 `.txt` / `.md`，自动拆成每日任务
- 无需联网的本地规则拆分，以及可选的 DeepSeek 智能拆分
- 按开始日期、目标日期、每日时长和单次专注时长排期
- 未完成任务的一键自适应重排与超期提醒
- 必须由本人确认完成，随后记录成就、展示桌面弹窗并播放翻页式解锁音效
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

## DeepSeek 配置

打开左下角“DeepSeek 设置”，填写 API Key 和模型名。接口固定为官方 `https://api.deepseek.com/chat/completions`；默认模型为 `deepseek-chat`，如果你的 V4 API 使用专属模型标识，请以服务商提供的名称替换。

任务与设置保存在 Electron 的 `userData` 目录，不会写入项目仓库。
