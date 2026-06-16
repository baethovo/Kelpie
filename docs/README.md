# 文档

## 原理

项目参照了 SillyTavern 的对话补全预设请求格式，并做了以下调整：

- 将 `Chat History` 中用户最新输入的部分替换为 `userid : sendContent` 的形式，以区分不同玩家的发言。
- 每个房间使用独立的 `USER.md` 来记录不同用户的设定，其内容同样以 `userid : sendContent` 的格式进行替换。

## 预设

项目在 Release 中提供了一个基础预设：[preset.json](https://github.com/baethovo/kelpie/releases/latest/download/preset.json)


## 相关文档

- [Sandbox API](./sandbox-api.md) — HTML 沙箱渲染及 Kelpie/Sandbox API 说明

