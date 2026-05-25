import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { setupRealtimeWsServer } from './src/realtime/wsServer.js';
import { startCleanupTask } from './src/services/roomService.js';
import pc from 'picocolors';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig(baseDir);
const app = await createApp(config);
const server = http.createServer(app);

startCleanupTask(config.baseDir);

setupRealtimeWsServer({
    server,
    config,
    sessionParser: app.locals.sessionMiddleware,
});

const ascii = `
---------------------------------------------

██╗  ██╗███████╗██╗     ██████╗ ██╗███████╗
██║ ██╔╝██╔════╝██║     ██╔══██╗██║██╔════╝
█████╔╝ █████╗  ██║     ██████╔╝██║█████╗  
██╔═██╗ ██╔══╝  ██║     ██╔═══╝ ██║██╔══╝  
██║  ██╗███████╗███████╗██║     ██║███████╗
╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═╝╚══════╝

---------------------------------------------
`;

const hexToRgb = hex => hex.match(/\w\w/g).map(x => parseInt(x, 16));
const [topColor, bottomColor] = [hexToRgb('#ffbe46'), hexToRgb('#c0810b')]; 

const lines = ascii.trim().split('\n');

console.log(lines.map((line, i) => {
  const ratio = i / (lines.length - 1);
  const [r, g, b] = topColor.map((c, j) => Math.round(c + ratio * (bottomColor[j] - c)));
  return `\x1b[38;2;${r};${g};${b}m${line}\x1b[0m`;
}).join('\n'));

const repoUrl = 'https://github.com/baethovo/kelpie';

console.log(`${pc.bgBlack(pc.white(' GITHUB '))} ${pc.cyan(pc.underline(repoUrl))}\n`);

const requestedPort = Number(process.env.PORT || config.port || 3000);
server.listen(requestedPort, () => {
    console.log(`${pc.green(`Server is running at ${pc.white(`http://localhost:${requestedPort}`)}`)}`);
});

server.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${requestedPort} is already in use. Please stop the existing process or set another PORT.`);
        process.exit(1);
        return;
    }

    console.error('Failed to start server.');
    console.error(error);
    process.exit(1);
});
