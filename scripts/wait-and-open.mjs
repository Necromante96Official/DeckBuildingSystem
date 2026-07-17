/**
 * Espera a porta e abre o browser. Sem PowerShell / bandeja.
 * Uso: node scripts/wait-and-open.mjs [porta]
 */
import { spawn } from "node:child_process";
import net from "node:net";

const port = Number(process.argv[2] || process.env.PORT || 5177);
const url = `http://127.0.0.1:${port}/`;

function canConnect(ms) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(ms, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function main() {
  // Se ainda ha listener antigo a morrer, espera libertar
  for (let i = 0; i < 40; i++) {
    if (!(await canConnect(200))) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  for (let i = 0; i < 120; i++) {
    if (await canConnect(600)) {
      await new Promise((r) => setTimeout(r, 300));
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  process.exit(1);
}

main();
