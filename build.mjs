import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
let page = await readFile(resolve(root, "src/index.html"), "utf8");
page = page.replace("/*__STYLES__*/", await readFile(resolve(root, "src/styles.css"), "utf8"));
page = page.replace("/*__APP__*/", await readFile(resolve(root, "src/app.js"), "utf8"));
for (const [name, mime] of [["tractor.jpg", "image/jpeg"], ["cabinet.jpg", "image/jpeg"], ["truck.jpg", "image/jpeg"]]) {
  const bytes = await readFile(resolve(root, "src/assets", name));
  page = page.replaceAll(`assets/${name}`, `data:${mime};base64,${bytes.toString("base64")}`);
}
const handler = await readFile(resolve(root, "worker/handler.js"), "utf8");
const icon192 = (await readFile(resolve(root, "src/assets/icon-192.png"))).toString("base64");
const icon512 = (await readFile(resolve(root, "src/assets/icon-512.png"))).toString("base64");
const output = `const page = ${JSON.stringify(page)};\nconst icon192Base64 = ${JSON.stringify(icon192)};\nconst icon512Base64 = ${JSON.stringify(icon512)};\n${handler}`;
const out = resolve(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(resolve(out, "server"), { recursive: true });
await mkdir(resolve(out, ".openai"), { recursive: true });
await writeFile(resolve(out, "index.html"), page);
await writeFile(resolve(out, "server/index.js"), output);
await writeFile(resolve(out, ".openai/hosting.json"), await readFile(resolve(root, ".openai/hosting.json")));
console.log(`Built ${out}`);
