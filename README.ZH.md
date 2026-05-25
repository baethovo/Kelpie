# Kelpie

<p align="center">
  <img src="assets/icon.png" alt="Kelpie" width="128">
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>中文</strong>
</p>

---

Kelpie 是一个基于 LLM 的在线 TRPG（桌上角色扮演游戏）平台，提供了丰富的功能来支持玩家和游戏主持人（GM）进行互动和游戏管理。

*   **多人游玩** — 支持多位玩家同时在线参与 LLM 角色扮演。
*   **SillyTavern 兼容** — 支持导入 SillyTavern 格式的角色卡、对话补全预设和世界书。
*   **HTML 渲染** — 支持在对话中渲染 HTML 页面。

## 快速开始

### 本地部署

#### 环境要求

*   Node.js >= 18
*   npm

#### 安装

```bash
git clone https://github.com/baethovo/kelpie
cd kelpie
npm install
```

#### 配置

编辑 `config/default.yaml` 文件：

```yaml
port: 3000          # 服务器端口
listen: false       # 监听所有接口 (true) 或仅本地 (false)
allowRegistration: true  # 是否允许用户注册
```

#### 运行

```bash
npm start
# 或
npm run dev
```

### Docker 部署

#### 方式一：使用 Docker Compose（推荐）

在项目根目录下运行以下命令即可启动：

```bash
docker-compose up -d
```

这会自动构建镜像，并将数据目录 `data` 与配置文件目录 `config` 挂载到宿主机，实现数据持久化。

#### 方式二：使用 Docker CLI

1.  构建镜像：
    ```bash
    docker build -t kelpie .
    ```
2.  运行容器（挂载 `data` 和 `config` 目录以实现数据持久化）：
    ```bash
    docker run -d -p 3000:3000 -v ./data:/app/data -v ./config:/app/config --name kelpie-app kelpie
    ```

> [!NOTE]
> 第一个注册的账户将会自动成为管理员账户。

## Todo

- [ ] 会话分支
- [ ] ...

## 说明

项目由 vibe coding 辅助开发，目前 bug 较多，功能也不完善，欢迎提交 issue 和 pull request。

## 特别鸣谢

*   [MDUI](https://github.com/zdhxiong/mdui)
*   [SillyTavern](https://github.com/SillyTavern/SillyTavern)