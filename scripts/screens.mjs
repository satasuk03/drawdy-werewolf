// Screenshots the panel for every captured view, at phone and desktop sizes,
// and renders the host's board components. Usage: node scripts/screens.mjs <outDir>
import { build } from "esbuild";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = process.argv[2];
const only = process.argv[3];
mkdirSync(out, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!only?.startsWith("skip-capture")) {
    await build({ entryPoints: [join(root, "test/capture.ts")], bundle: true, platform: "node", format: "esm", outfile: join(out, "capture.mjs"), logLevel: "warning" });
    const run = spawnSync(process.execPath, [join(out, "capture.mjs")], { env: { ...process.env, CAPTURE_DIR: out }, stdio: "inherit" });
    if (run.status !== 0) process.exit(1);
}
const { shots, visuals } = JSON.parse(readFileSync(join(out, "views.json"), "utf8"));
const { outputFiles } = await build({ entryPoints: [join(root, "src/webview-html.ts")], bundle: true, format: "esm", write: false, platform: "node" });
const html = (await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"))).WEBVIEW_HTML;
const langs = (process.env.LANGS ?? "en,th,zh").split(",");

// Headless Chrome lays out at least 500px wide, so narrower shots go through an iframe and get cropped.
function shoot(file, w, h) {
    const png = file.replace(/\.html$/, ".png");
    let target = file;
    if (w < 500) {
        target = file.replace(/\.html$/, ".frame.html");
        writeFileSync(target, `<!doctype html><body style="margin:0"><iframe src="file://${file}" style="border:0;width:${w}px;height:${h}px;display:block;margin-left:${(500 - w) / 2}px"></iframe></body>`);
    }
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${png}`, `--window-size=${Math.max(w, 500)},${h}`, "--virtual-time-budget=3000", `file://${target}`], { stdio: "ignore" });
    if (w < 500) execFileSync("sips", ["--cropToHeightWidth", String(h), String(w), "--cropOffset", "0", "0", png], { stdio: "ignore" });
}

for (const lang of langs) {
    for (const [name, captured] of Object.entries(shots)) {
        if (only && !only.startsWith("skip-capture") && !name.includes(only)) continue;
        const view = { ...captured, lang };
        // Freeze the clock at capture time so timers render as they did live.
        const shim = `<script>
const __view=${JSON.stringify(view)};
const __offset = Date.now() - __view.now - 7000;
window.acquireDrawdyApi=()=>({postMessage(){},onMessage(l){setTimeout(()=>l({t:"view",view:{...__view,now:Date.now()-__offset}}),10);return()=>{}}});
</script>`;
        const page = html.replace("<script>", shim + "<script>");
        for (const [label, w, h] of [["phone", 390, 844], ["wide", 1180, 820]]) {
            const file = join(out, `${lang}.${name}.${label}.html`);
            writeFileSync(file, page);
            shoot(file, w, h);
        }
        const chatFile = join(out, `${lang}.${name}.phone-chat.html`);
        writeFileSync(chatFile, page.replace("</body>", `<script>setTimeout(()=>document.querySelectorAll('.tabs button')[1]?.click(),200)</script></body>`));
        shoot(chatFile, 390, 844);
    }
}

// Board components: a rough DomElementSchema renderer, enough to judge layout.
function dom(s) {
    const st = s.styles ?? {};
    const css = [];
    const d = (v) => (Array.isArray(v) ? `${v[0]}${v[1]}` : v);
    if (st.width) css.push(`width:${d(st.width)}`);
    if (st.height) css.push(`height:${d(st.height)}`);
    if (st.padding) css.push(`padding:${d(st.padding)}`);
    if (st.backgroundColor) css.push(`background:${st.backgroundColor}`);
    if (st.borderRadius) css.push(`border-radius:${d(st.borderRadius)}`);
    if (st.overflow) css.push(`overflow:${st.overflow}`);
    if (st.color) css.push(`color:${st.color}`);
    if (st.fontSize) css.push(`font-size:${d(st.fontSize)}`);
    if (st.fontWeight) css.push(`font-weight:${{ normal: 400, medium: 500, semibold: 600, bold: 700 }[st.fontWeight]}`);
    if (st.textAlign) css.push(`text-align:${st.textAlign}`);
    const al = { between: "space-between", around: "space-around", start: "flex-start", center: "center", end: "flex-end" };
    if (s.type === "row" || s.type === "column" || s.type === "button") {
        css.push(`display:flex;flex-direction:${s.type === "column" ? "column" : "row"}`);
        if (st.gap) css.push(`gap:${st.gap}px`);
        if (st.mainAxisAlignment) css.push(`justify-content:${al[st.mainAxisAlignment]}`);
        if (st.crossAxisAlignment) css.push(`align-items:${al[st.crossAxisAlignment]}`);
    }
    if (s.type === "grid") css.push(`display:grid;grid-template-columns:repeat(${st.columns ?? 1},auto);gap:${st.gap ?? 0}px`);
    if (s.type === "text") return `<div style="${css.join(";")}">${s.child.replace(/</g, "&lt;")}</div>`;
    if (s.type === "image") return `<img src="${s.child}" style="${css.join(";")};display:block">`;
    return `<div style="${css.join(";")}">${(s.children ?? []).map(dom).join("")}</div>`;
}
for (const [when, v] of Object.entries(visuals)) {
    if (!v.table) continue;
    const file = join(out, `board-${when}.html`);
    writeFileSync(file, `<!doctype html><body style="margin:0;background:#0e1022;font-family:Inter,system-ui,sans-serif"><div style="display:flex;gap:20px;padding:24px">${dom(v.table)}${v.chat ? dom(v.chat) : ""}</div></body>`);
    shoot(file, 1400, 820);
}
console.log("screens in", out);
