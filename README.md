# Kelpie

<p align="center">
  <strong>English</strong> | <a href="README.ZH.md">中文</a>
</p>

---

Kelpie is an LLM-driven online TRPG (Tabletop Role-Playing Game) platform, providing a rich set of features to support interactions and game management for players and Game Masters (GM).

* **Multiplayer Play** — Supports multiple players participating in LLM role-play online simultaneously.
* **SillyTavern Compatibility** — Supports importing character cards, completion presets, and world books in SillyTavern format.
* **HTML Rendering** — Supports rendering HTML pages directly within the chat dialogue.

## Documentation

[![Docs](https://img.shields.io/badge/Documentation-blue?style=for-the-badge)](./docs/README.md)

## Quick Start

### Local Deployment

#### Prerequisites

* Node.js >= 18
* npm

#### Installation

```bash
git clone https://github.com/baethovo/kelpie
cd kelpie
npm install
```

#### Configuration

Edit the `config/default.yaml` file:

```yaml
port: 3000          # Server port
listen: false       # Listen on all interfaces (true) or localhost only (false)
allowRegistration: true  # Whether to allow user registration
```

#### Run

```bash
npm start
# or
npm run dev
```

### Docker Deployment

#### Option 1: Using Docker Compose (Recommended)

Run the following command in the root directory of the project to start the application:

```bash
docker-compose up -d
```

This will automatically build the image, and mount the `data` directory and `config` directory to the host for data persistence.

#### Option 2: Using Docker CLI

1. Build the image:
   
   ```bash
   docker build -t kelpie .
   ```
2. Run the container (mounting the `data` and `config` directories for persistence):
   
   ```bash
   docker run -d -p 3000:3000 -v ./data:/app/data -v ./config:/app/config --name kelpie-app kelpie
   ```

> [!NOTE]
> The first registered account will automatically become the administrator account.

## Todo

- [ ] Session branching
- [ ] ...

## Notes

This project is developed with the assistance of vibe coding. Currently, there are many bugs and features are incomplete. Issues and pull requests are welcome.

## Special Thanks

* [MDUI](https://github.com/zdhxiong/mdui)
* [SillyTavern](https://github.com/SillyTavern/SillyTavern)
* [Tavern-Helper](https://github.com/N0VI028/JS-Slash-Runner)
