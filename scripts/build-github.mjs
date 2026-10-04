import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build as bundle } from "esbuild";

const root = resolve(import.meta.dirname, "..");
let page = await readFile(resolve(root, "src/index.html"), "utf8");
const styles = await readFile(resolve(root, "src/styles.css"), "utf8");
const appSource = await readFile(resolve(root, "src/app.js"), "utf8");
const bundled = await bundle({
  stdin: { contents: appSource, sourcefile: "src/app.js", resolveDir: root },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2020"]
});
const app = `globalThis.HAMMERLIST_API_BASE_URL=${JSON.stringify(process.env.HAMMERLIST_API_BASE_URL || "")};\n${bundled.outputFiles[0].text}`;
page = page.replace("/*__STYLES__*/", () => styles);
page = page.replace("/*__APP__*/", () => app);

function card(label, subtitle, background, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><rect width="1200" height="760" fill="${background}"/><circle cx="975" cy="145" r="190" fill="${accent}" opacity=".25"/><path d="M0 610L280 430l230 115 225-210 465 300v125H0z" fill="${accent}" opacity=".33"/><rect x="72" y="510" width="700" height="150" rx="24" fill="#fff" opacity=".92"/><text x="112" y="574" font-family="Arial,sans-serif" font-size="48" font-weight="700" fill="#123c31">${label}</text><text x="112" y="624" font-family="Arial,sans-serif" font-size="27" fill="#53635e">${subtitle}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const cards = {
  "tractor.jpg": card("1937 John Deere AR", "Farm equipment catalog example", "#d8dfc0", "#7c952b"),
  "cabinet.jpg": card("French Oak Cabinet", "Estate and antique catalog example", "#eadbc6", "#9a603c"),
  "truck.jpg": card("1972 Ford F-250", "Vehicle auction catalog example", "#cbd9df", "#44768c")
};
for (const [name, uri] of Object.entries(cards)) page = page.replaceAll(`assets/${name}`, uri);

const out = resolve(root, "dist-github");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "index.html"), page);
console.log(`Built ${resolve(out, "index.html")} (${Buffer.byteLength(page)} bytes)`);
