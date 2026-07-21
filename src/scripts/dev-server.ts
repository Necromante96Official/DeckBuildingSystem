import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIST_DIR,
  EFFECT_TIERS_JSON,
  GENERATION_BANS_JSON,
  PUBLIC_DIR,
  ROOT,
  SAVED_DECKS_JSON,
  SAVED_SEEDS_JSON,
} from "../lib/paths.ts";
import type {
  EffectTiersFile,
  GenerationBansFile,
  SavedDeckEntry,
  SavedDecksFile,
  SavedSeedEntry,
  SavedSeedsFile,
} from "../types/card.ts";

const PORT = Number(process.env.PORT || 5177);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const LIVE_RELOAD_SNIPPET = `
<script>
(function () {
  try {
    if (sessionStorage.getItem("fl_deck_reload") === "1") {
      sessionStorage.removeItem("fl_deck_reload");
    }
  } catch (e) {}

  function ping() {
    try {
      fetch("/api/presence", { method: "POST", keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  ping();
  setInterval(ping, 2500);

  try {
    var es = new EventSource("/api/livereload");
    es.addEventListener("reload", function () {
      try { sessionStorage.setItem("fl_deck_reload", "1"); } catch (e) {}
      location.reload();
    });
    es.onerror = function () { /* reconnect automatico */ };
  } catch (e) {}
})();
</script>
`;

type SseClient = { res: http.ServerResponse };
const sseClients = new Set<SseClient>();
let rebuildBusy = false;
let rebuildQueued = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastPresenceAt = 0;
let hadPresence = false;
let shuttingDown = false;

function requestShutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${reason}`);
  const cmdPid = Number(process.env.FL_CMD_PID || 0);
  try {
    for (const c of [...sseClients]) {
      try {
        c.res.end();
      } catch {
        /* ignore */
      }
      sseClients.delete(c);
    }
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    if (cmdPid > 0 && Number.isFinite(cmdPid)) {
      try {
        spawn("taskkill", ["/PID", String(cmdPid), "/T", "/F"], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        }).unref();
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  }, 120);
}

function resolveFile(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split("?")[0] || "/");
  const rel = clean === "/" ? "index.html" : clean.replace(/^\//, "");
  const candidates = [
    path.join(DIST_DIR, rel),
    path.join(ROOT, rel),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function notifyReload(reason: string): void {
  const payload =
    `event: reload\ndata: ${JSON.stringify({ t: Date.now(), reason })}\n\n`;
  for (const c of [...sseClients]) {
    try {
      c.res.write(payload);
    } catch {
      sseClients.delete(c);
    }
  }
  console.log(`[livereload] ${reason} → ${sseClients.size} cliente(s)`);
}

function copyPublic(): void {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    const src = path.join(PUBLIC_DIR, name);
    const dest = path.join(DIST_DIR, name);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, dest);
  }
}

async function quickRebuild(reason: string): Promise<void> {
  if (rebuildBusy) {
    rebuildQueued = true;
    return;
  }
  rebuildBusy = true;
  try {
    copyPublic();
    await esbuild.build({
      entryPoints: [path.join(ROOT, "src", "app", "main.ts")],
      bundle: true,
      outfile: path.join(DIST_DIR, "app.js"),
      format: "iife",
      platform: "browser",
      target: ["es2020"],
      sourcemap: true,
      logLevel: "silent",
    });
    notifyReload(reason);
  } catch (err) {
    console.error("[livereload] rebuild falhou:", err);
  } finally {
    rebuildBusy = false;
    if (rebuildQueued) {
      rebuildQueued = false;
      void quickRebuild("queued");
    }
  }
}

function scheduleRebuild(reason: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void quickRebuild(reason);
  }, 280);
}

function watchTree(dir: string, label: string): void {
  if (!fs.existsSync(dir)) return;
  try {
    fs.watch(dir, { recursive: true }, (_ev, filename) => {
      if (!filename) return;
      const lower = String(filename).toLowerCase();
      if (
        lower.endsWith(".map") ||
        lower.includes("node_modules") ||
        lower.endsWith("~")
      ) {
        return;
      }
      scheduleRebuild(`${label}:${filename}`);
    });
    console.log(`[watch] ${dir}`);
  } catch (err) {
    console.warn(`[watch] falhou em ${dir}:`, err);
  }
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    console.error("docs/ vazio. Corre primeiro: npm run build");
    process.exit(1);
  }

  watchTree(path.join(ROOT, "src", "app"), "app");
  watchTree(PUBLIC_DIR, "public");
  watchTree(path.join(ROOT, "src", "lib"), "lib");

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";
    const pathOnly = url.split("?")[0] || "/";

    if (pathOnly === "/api/livereload") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      // Comentario SSE: nao dispara onmessage / reload no cliente
      res.write(": connected\n\n");
      const client = { res };
      sseClients.add(client);
      req.on("close", () => sseClients.delete(client));
      return;
    }

    if (pathOnly === "/api/presence") {
      if (req.method === "POST" || req.method === "GET") {
        lastPresenceAt = Date.now();
        hadPresence = true;
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }

    if (pathOnly === "/api/shutdown") {
      if (req.method === "POST" || req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("bye");
        requestShutdown("pagina fechada");
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }

    if (pathOnly === "/api/effect-tiers") {
      if (req.method === "GET") {
        let data: EffectTiersFile = { tiers: {} };
        if (fs.existsSync(EFFECT_TIERS_JSON)) {
          data = JSON.parse(
            fs.readFileSync(EFFECT_TIERS_JSON, "utf8"),
          ) as EffectTiersFile;
        }
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(data));
        return;
      }
      if (req.method === "POST") {
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as EffectTiersFile;
          if (!body || typeof body.tiers !== "object") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "tiers inválido" }));
            return;
          }
          const cleaned: EffectTiersFile = {
            updated_at: new Date().toISOString(),
            tiers: {},
          };
          for (const [k, v] of Object.entries(body.tiers)) {
            if (v === 3 || v === 4 || v === 5) cleaned.tiers[k] = v;
          }
          fs.mkdirSync(path.dirname(EFFECT_TIERS_JSON), { recursive: true });
          fs.writeFileSync(
            EFFECT_TIERS_JSON,
            `${JSON.stringify(cleaned, null, 2)}\n`,
            "utf8",
          );
          const distCopy = path.join(DIST_DIR, "data", "effect-tiers.json");
          fs.mkdirSync(path.dirname(distCopy), { recursive: true });
          fs.copyFileSync(EFFECT_TIERS_JSON, distCopy);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              ok: true,
              count: Object.keys(cleaned.tiers).length,
            }),
          );
          notifyReload("effect-tiers");
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }

    if (pathOnly === "/api/generation-bans") {
      if (req.method === "GET") {
        let data: GenerationBansFile = { bans: {} };
        if (fs.existsSync(GENERATION_BANS_JSON)) {
          data = JSON.parse(
            fs.readFileSync(GENERATION_BANS_JSON, "utf8"),
          ) as GenerationBansFile;
        }
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(data));
        return;
      }
      if (req.method === "POST") {
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as {
            tipo?: string;
            atributo?: string;
            slug?: string;
          };
          const slug = String(body.slug || "")
            .trim()
            .toLowerCase();
          if (!slug) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "slug inválido" }));
            return;
          }
          const norm = (s: string) =>
            s
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, " ");
          const key = `${norm(String(body.tipo || ""))}|${norm(String(body.atributo || ""))}`;

          let data: GenerationBansFile = { bans: {} };
          if (fs.existsSync(GENERATION_BANS_JSON)) {
            data = JSON.parse(
              fs.readFileSync(GENERATION_BANS_JSON, "utf8"),
            ) as GenerationBansFile;
          }
          if (!data.bans || typeof data.bans !== "object") data.bans = {};
          const list = new Set(data.bans[key] || []);
          list.add(slug);
          data.bans[key] = [...list].sort();
          data.updated_at = new Date().toISOString();

          fs.mkdirSync(path.dirname(GENERATION_BANS_JSON), { recursive: true });
          fs.writeFileSync(
            GENERATION_BANS_JSON,
            `${JSON.stringify(data, null, 2)}\n`,
            "utf8",
          );
          const distCopy = path.join(DIST_DIR, "data", "generation-bans.json");
          fs.mkdirSync(path.dirname(distCopy), { recursive: true });
          fs.copyFileSync(GENERATION_BANS_JSON, distCopy);

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              ok: true,
              key,
              count: data.bans[key].length,
              bans: data,
            }),
          );
          // Sem notifyReload: o cliente actualiza e regenera localmente
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }

    if (pathOnly === "/api/saved-seeds") {
      function readSavedSeeds(): SavedSeedsFile {
        if (fs.existsSync(SAVED_SEEDS_JSON)) {
          try {
            const data = JSON.parse(
              fs.readFileSync(SAVED_SEEDS_JSON, "utf8"),
            ) as SavedSeedsFile;
            if (data && Array.isArray(data.seeds)) return data;
          } catch {
            /* fall through */
          }
        }
        return { updated_at: null, seeds: [] };
      }

      function writeSavedSeeds(data: SavedSeedsFile): void {
        fs.mkdirSync(path.dirname(SAVED_SEEDS_JSON), { recursive: true });
        fs.writeFileSync(
          SAVED_SEEDS_JSON,
          `${JSON.stringify(data, null, 2)}\n`,
          "utf8",
        );
        const distCopy = path.join(DIST_DIR, "data", "saved-seeds.json");
        fs.mkdirSync(path.dirname(distCopy), { recursive: true });
        fs.copyFileSync(SAVED_SEEDS_JSON, distCopy);
      }

      if (req.method === "GET") {
        const data = readSavedSeeds();
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(data));
        return;
      }

      if (req.method === "POST") {
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as Partial<SavedSeedEntry>;
          if (
            !body ||
            typeof body.seed !== "number" ||
            !body.options ||
            !body.result
          ) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ ok: false, error: "seed/options/result inválidos" }),
            );
            return;
          }
          const entry: SavedSeedEntry = {
            id:
              typeof body.id === "string" && body.id.trim()
                ? body.id.trim()
                : crypto.randomUUID(),
            saved_at:
              typeof body.saved_at === "string"
                ? body.saved_at
                : new Date().toISOString(),
            seed: body.seed,
            label: typeof body.label === "string" ? body.label : undefined,
            options: body.options as SavedSeedEntry["options"],
            result: body.result as SavedSeedEntry["result"],
          };
          const data = readSavedSeeds();
          const idx = data.seeds.findIndex((s) => s.id === entry.id);
          if (idx >= 0) data.seeds[idx] = entry;
          else data.seeds.unshift(entry);
          data.updated_at = new Date().toISOString();
          writeSavedSeeds(data);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({ ok: true, id: entry.id, count: data.seeds.length, seeds: data }),
          );
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
        return;
      }

      if (req.method === "DELETE") {
        try {
          const q = new URL(url, "http://127.0.0.1").searchParams;
          const id = String(q.get("id") || "").trim();
          if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "id em falta" }));
            return;
          }
          const data = readSavedSeeds();
          const before = data.seeds.length;
          data.seeds = data.seeds.filter((s) => s.id !== id);
          data.updated_at = new Date().toISOString();
          writeSavedSeeds(data);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              ok: true,
              removed: before !== data.seeds.length,
              count: data.seeds.length,
              seeds: data,
            }),
          );
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
        return;
      }

      res.writeHead(405);
      res.end();
      return;
    }

    if (pathOnly === "/api/saved-decks") {
      function readSavedDecks(): SavedDecksFile {
        if (fs.existsSync(SAVED_DECKS_JSON)) {
          try {
            const data = JSON.parse(
              fs.readFileSync(SAVED_DECKS_JSON, "utf8"),
            ) as SavedDecksFile;
            if (data && Array.isArray(data.decks)) return data;
          } catch {
            /* fall through */
          }
        }
        return { updated_at: null, decks: [] };
      }

      function writeSavedDecks(data: SavedDecksFile): void {
        fs.mkdirSync(path.dirname(SAVED_DECKS_JSON), { recursive: true });
        fs.writeFileSync(
          SAVED_DECKS_JSON,
          `${JSON.stringify(data, null, 2)}\n`,
          "utf8",
        );
        const distCopy = path.join(DIST_DIR, "data", "saved-decks.json");
        fs.mkdirSync(path.dirname(distCopy), { recursive: true });
        fs.copyFileSync(SAVED_DECKS_JSON, distCopy);
      }

      if (req.method === "GET") {
        const data = readSavedDecks();
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(data));
        return;
      }

      if (req.method === "POST") {
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as Partial<SavedDeckEntry>;
          if (
            !body ||
            !Array.isArray(body.entries) ||
            typeof body.total !== "number"
          ) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ ok: false, error: "entries/total inválidos" }),
            );
            return;
          }
          const entry: SavedDeckEntry = {
            id:
              typeof body.id === "string" && body.id.trim()
                ? body.id.trim()
                : crypto.randomUUID(),
            saved_at:
              typeof body.saved_at === "string"
                ? body.saved_at
                : new Date().toISOString(),
            label:
              typeof body.label === "string" && body.label.trim()
                ? body.label.trim()
                : `Deck ${new Date().toLocaleDateString("pt-BR")}`,
            entries: body.entries as SavedDeckEntry["entries"],
            composition: (body.composition ||
              {}) as SavedDeckEntry["composition"],
            total: body.total,
            total_deck_power: Number(body.total_deck_power) || 0,
            average_power_tier: Number(body.average_power_tier) || 0,
            meta: body.meta,
          };
          const data = readSavedDecks();
          const idx = data.decks.findIndex((d) => d.id === entry.id);
          if (idx >= 0) data.decks[idx] = entry;
          else data.decks.unshift(entry);
          data.updated_at = new Date().toISOString();
          writeSavedDecks(data);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              ok: true,
              id: entry.id,
              count: data.decks.length,
              decks: data,
            }),
          );
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
        return;
      }

      if (req.method === "DELETE") {
        try {
          const q = new URL(url, "http://127.0.0.1").searchParams;
          const id = String(q.get("id") || "").trim();
          if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "id em falta" }));
            return;
          }
          const data = readSavedDecks();
          const before = data.decks.length;
          data.decks = data.decks.filter((d) => d.id !== id);
          data.updated_at = new Date().toISOString();
          writeSavedDecks(data);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              ok: true,
              removed: before !== data.decks.length,
              count: data.decks.length,
              decks: data,
            }),
          );
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
        return;
      }

      res.writeHead(405);
      res.end();
      return;
    }

    const file = resolveFile(url);
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    if (ext === ".html") {
      let html = fs.readFileSync(file, "utf8");
      if (!html.includes("/api/livereload")) {
        html = html.includes("</body>")
          ? html.replace("</body>", `${LIVE_RELOAD_SNIPPET}</body>`)
          : html + LIVE_RELOAD_SNIPPET;
      }
      res.writeHead(200, {
        "Content-Type": MIME[ext],
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control":
        ext === ".js" || ext === ".css" ? "no-store" : "public, max-age=60",
    });
    fs.createReadStream(file).pipe(res);
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`DeckBuildingSystem → http://127.0.0.1:${PORT}/`);
    console.log("livereload activo (public/ + src/app + src/lib)");
    console.log("fechar a pagina no browser encerra o sistema");
  });

  // Fechar o separador: para de fazer ping → encerra apos ~6s (F5/live reload retomam o ping)
  setInterval(() => {
    if (shuttingDown || !hadPresence) return;
    if (Date.now() - lastPresenceAt < 6000) return;
    requestShutdown("pagina fechada (sem presence)");
  }, 1500);
}
