/**
 * Encerra o que estiver na porta e leftovers (tray antigo, wait-and-open).
 * Uso: node scripts/stop-port.mjs [porta]
 */
import { execSync } from "node:child_process";

const port = Number(process.argv[2] || 5177);

function taskkill(pid) {
  const n = Number(pid);
  if (!n || n <= 0) return;
  try {
    execSync(`taskkill /F /T /PID ${n}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function pidsOnPort() {
  const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
  const re = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "gi");
  const ids = new Set();
  let m;
  while ((m = re.exec(out))) ids.add(m[1]);
  return [...ids];
}

function pidsByCmdMatch(pattern) {
  try {
    const out = execSync(
      "wmic process where \"name='powershell.exe' or name='pwsh.exe' or name='node.exe'\" get ProcessId,CommandLine /format:csv",
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const ids = [];
    for (const line of out.split(/\r?\n/)) {
      if (!pattern.test(line)) continue;
      const parts = line.split(",");
      const pid = parts[parts.length - 1]?.trim();
      if (pid && /^\d+$/.test(pid)) ids.push(pid);
    }
    return ids;
  } catch {
    return [];
  }
}

for (const pid of pidsOnPort()) taskkill(pid);
for (const pid of pidsByCmdMatch(
  /tray-host\.ps1|open-when-ready\.ps1|wait-and-open\.mjs|criacao-de-deck.*dev-server|cria[cç][aã]o-de-deck.*dev-server/i,
)) {
  taskkill(pid);
}

process.exit(0);
