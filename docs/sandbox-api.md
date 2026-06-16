# Sandbox 使用文档
# 警告：此功能尚在开发中，极其不稳定！

设置中的 **整段 HTML 渲染** 功能可以将 AI 返回的 HTML/CSS/JS 代码块在一个安全的 `<iframe>` 沙箱中独立运行，并提供了一套 **Kelpie/Sandbox API** 供 HTML 块与聊天界面（父窗口）进行通信。

---

## 基本原理

AI 在回复中若包含如下形式的代码块，系统会自动将其渲染为一个可交互的 iframe（如果房主在设置中开启了"允许 JS 渲染"）：

````markdown
```html
<!-- 你的 HTML 内容 -->
<button onclick="kelpie.send2input('我选择了选项 A。')">点击我</button>
```
````

 iframe 具有 `allow-scripts allow-forms allow-modals allow-pointer-lock allow-same-origin` 沙箱属性。

为了方便开发者扩充和编写代码，我们在沙箱中提供了 **模块化导入 (ES Modules)** 和 **全局命名空间 (Classic / Global Window)** 两种使用方式。

---

## 引入 API 的两种方式

### 方式一：模块化导入 (ES Modules) - 推荐
沙箱底层的 `importmap` 已经为您映射了 `kelpie` 和 `sandBox` 模块，指向 `/js/kelpie-api.js`。

```html
<script type="module">
  // 您可以导入特定的 API 函数
  import { send2input, writeRN, writeUserMD } from 'kelpie';

  // 或者导入整个命名空间
  import kelpie from 'kelpie';

  document.querySelector('#my-btn').addEventListener('click', () => {
    send2input('玩家选择了选项 A。');
  });
</script>
```

### 方式二：全局命名空间 (Classic Script / Inline Event Handlers)
沙箱会自动在全局作用域的 `window.kelpie` 和 `window.sandBox` 上挂载所有 API 属性，并且该挂载是 **同步且立即生效的**。
这使得您可以直接在普通 `<script>` 块、第三方库代码或 HTML 标签的事件属性（例如 `onclick`）中直接调用。

```html
<!-- 示例 1：直接在标签 onclick 属性中调用 -->
<button onclick="kelpie.send2input('我决定出发前往森林！')">🌳 出发</button>
<button onclick="sandBox.writeRN('狂暴战士')">🛡️ 切换为狂暴姿态</button>

<!-- 示例 2：在普通 classic 脚本中调用 -->
<script>
  // 无需使用 import，直接通过全局变量访问
  function customAction() {
    kelpie.writeUserMD('# 新的人物卡设定\n\n生命值：100');
  }
</script>
```

---

## API 参考

### 1. `send2input(text: string): void`
将指定的文字追加到聊天室底部的输入框，并自动为输入框聚焦（Focus）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 要发送到输入框的内容 |

**示例：**
```js
kelpie.send2input('我尝试撬开这扇门。');
```

---

### 2. `writeUserMD(content: string): void`（别名：`send2UserMD`）
更新当前玩家角色的 Persona（人物卡/玩家设定 `USER.md`）。更新后会自动持久化保存到服务器，并实时同步给房间内的其他成员以及 AI 决策上下文。

| 参数 | 类型 | 说明 |
|------|------|------|
| `content` | `string` | 新的 Persona Markdown 文本 |

**示例：**
```js
// 这两种写法完全等价
kelpie.writeUserMD('# 圣骑士\n\n- 获得了：【光辉之盾】\n- 坚信正义必胜。');
send2UserMD('# 圣骑士\n\n- 获得了：【光辉之盾】\n- 坚信正义必胜。');
```

---

### 3. `writeRN(displayName: string): void`（别名：`send2RN`）
更新当前玩家在房间中的显示名称（Real Name / Display Name）。更新后会持久化到服务器的 `info.yaml` 中，并且会通过 WebSocket 实时更新房间内其他成员的侧边栏、聊天头像旁的名字，无需刷新页面。

| 参数 | 类型 | 说明 |
|------|------|------|
| `displayName` | `string` | 新的显示名字 |

**示例：**
```js
// 这两种写法完全等价
kelpie.writeRN('神圣守护者');
send2RN('神圣守护者');
```

---

### 4. `getInputBox(): { send: Function }`
返回一个代理对象，包含 `.send(text)` 方法，用于兼容第三方/旧版 SillyTavern 插件格式。

**示例：**
```js
const box = kelpie.getInputBox();
box.send('使用 getInputBox 发送的消息');
```

---

## 高度自适应

沙箱高度会通过 `ResizeObserver` 自动检测并实时调整大小（例如展开、折叠或动态加载内容时）。您**不需要**在 HTML 中手动编写调整 iframe 高度的代码，只需关注您界面的布局即可。

---

## 完整示例：TRPG 可交互卡片

这是一个典型的 TRPG 可交互卡片示例，演示了如何通过选项卡控制状态、在 input 框填入文字以及实时修改显示名称：

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: sans-serif;
      padding: 12px;
      color: #fff;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
    }
    .card {
      border: 1px solid #555;
      padding: 16px;
      border-radius: 12px;
    }
    h4 { margin-top: 0; margin-bottom: 8px; }
    .btn-group { display: flex; gap: 8px; margin-top: 12px; }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: #0078d4;
      color: white;
      cursor: pointer;
    }
    button:hover { background: #005a9e; }
  </style>
</head>
<body>
  <div class="card">
    <h4>⚔️ 遭遇战触发</h4>
    <p>前方出现了一只巨型蜘蛛，请选择你的行动：</p>
    <div class="btn-group">
      <!-- 经典事件调用：直接发文字 -->
      <button onclick="kelpie.send2input('我拔出长剑，准备战斗！')">🗡️ 战斗</button>
      
      <!-- 经典事件调用：更名 -->
      <button onclick="kelpie.writeRN('无畏的战士')">🛡️ 更名</button>
      
      <!-- 经典事件调用：修改卡片设定 -->
      <button onclick="writeStatus()">📝 更新状态</button>
    </div>
  </div>

  <script>
    function writeStatus() {
      // 可以在普通 function 中访问全局命名空间
      kelpie.writeUserMD('# 战士\n\n- 当前状态：进入了与巨型蜘蛛的战斗阶段。');
      alert('状态已更新至 USER.md！');
    }
  </script>
</body>
</html>
```
