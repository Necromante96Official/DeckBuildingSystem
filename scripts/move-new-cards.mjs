import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destDir = path.join(root, "assets", "cartas_grande");
fs.mkdirSync(destDir, { recursive: true });

for (const name of [
  "lord_of_souls.webp",
  "red-eyes-absolut-darkness-dragon.webp",
]) {
  const src = path.join(root, name);
  const dest = path.join(destDir, name);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, dest);
  fs.unlinkSync(src);
}

const notes = path.join(root, "novas-cartas.txt");
if (fs.existsSync(notes)) fs.unlinkSync(notes);

console.log("Moved new card assets.");
