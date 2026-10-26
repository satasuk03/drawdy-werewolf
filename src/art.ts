import { t, type Lang } from "./i18n";
import type { RoleId } from "./roles";

type Stop = [offset: number, color: string, opacity?: number];

type Scene = {
    wolf: boolean;
    sky: [top: string, bottom: string];
    /** Square viewBox, in card coordinates, that frames the bust for PORTRAIT. */
    crop: string;
    /** `full` adds background detail that only pays off at card size. */
    draw: (p: string, full: boolean) => string;
};

const GOLD = "#d9b46a";
const SERIF = `Georgia, 'Times New Roman', serif`;

/** Banner lettering per language: Latin is spaced capitals; Thai and Chinese need their own serif faces and no spacing. */
const BANNER: Record<Lang, { font: string; size: number; weight: number; spacing: number; upper: boolean }> = {
    en: { font: SERIF, size: 20, weight: 400, spacing: 5, upper: true },
    th: { font: `'Noto Serif Thai', 'Sukhumvit Set', Thonburi, Tahoma, serif`, size: 22, weight: 700, spacing: 0, upper: false },
    zh: { font: `'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif`, size: 22, weight: 700, spacing: 8, upper: false },
};

const min = (s: string) => s.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();

const stops = (s: Stop[]) =>
    s
        .map(
            ([o, c, a]) =>
                `<stop offset="${o}" stop-color="${c}"${a === undefined ? "" : ` stop-opacity="${a}"`}/>`,
        )
        .join("");
const lg = (id: string, s: Stop[], dir = 'x2="0" y2="1"') =>
    `<linearGradient id="${id}" ${dir}>${stops(s)}</linearGradient>`;
const rg = (id: string, s: Stop[], attrs = "") =>
    `<radialGradient id="${id}"${attrs}>${stops(s)}</radialGradient>`;

const halo = (id: string, cx: number, cy: number, r: number, color: string, a: number) =>
    `${rg(id, [[0, color, a], [1, color, 0]])}<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`;

const fog = (id: string, y: number, h: number, color: string, a: number) =>
    `${lg(id, [[0, color, 0], [0.5, color, a], [1, color, 0]])}<rect y="${y}" width="300" height="${h}" fill="url(#${id})"/>`;

const moon = (id: string, cx: number, cy: number, r: number, light: string, edge: string, glow: string) =>
    `${halo(id + "h", cx, cy, r * 2.3, glow, 0.45)}${rg(id, [[0, "#fffaf0"], [0.55, light], [1, edge]], ' cx=".42" cy=".4" r=".62"')}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>
    <g fill="${edge}" opacity=".22"><circle cx="${cx - r * 0.3}" cy="${cy + r * 0.2}" r="${r * 0.22}"/><circle cx="${cx + r * 0.35}" cy="${cy - r * 0.25}" r="${r * 0.14}"/><circle cx="${cx + r * 0.15}" cy="${cy + r * 0.5}" r="${r * 0.1}"/></g>`;

/** A silhouette painted twice: a light copy nudged toward the light source, then the dark shape over it. */
const rimmed = (id: string, d: string, fill: string, rim: string, dx: number, dy: number) =>
    `<defs><path id="${id}" d="${d}"/></defs><use href="#${id}" fill="${rim}" transform="translate(${dx} ${dy})"/><use href="#${id}" fill="${fill}"/>`;

/** Draws `d` and its mirror image across the card's vertical centre line. */
const mirrored = (id: string, d: string, attrs: string) =>
    `<defs><path id="${id}" d="${d}" ${attrs}/></defs><use href="#${id}"/><use href="#${id}" transform="matrix(-1 0 0 1 300 0)"/>`;

const stars = (pts: number[][], color = "#fff") =>
    `<g fill="${color}">${pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${0.4 + (r % 1) * 0.6}"/>`).join("")}</g>`;

const sparkle = (x: number, y: number, s: number, color: string) =>
    `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${color}"/>`;

const pine = (x: number, base: number, h: number, w: number) => {
    let d = `M${x} ${base - h}`;
    for (let i = 0; i < 3; i++) {
        const y = base - h + h * (0.3 + i * 0.3);
        const hw = (w / 2) * (0.5 + i * 0.25);
        d += `L${x + hw} ${y}L${x + hw * 0.4} ${y - h * 0.06}`;
    }
    d += `L${x + w * 0.08} ${base}L${x - w * 0.08} ${base}`;
    for (let i = 2; i >= 0; i--) {
        const y = base - h + h * (0.3 + i * 0.3);
        const hw = (w / 2) * (0.5 + i * 0.25);
        d += `L${x - hw * 0.4} ${y - h * 0.06}L${x - hw} ${y}`;
    }
    return d + "Z";
};
const pines = (fill: string, list: number[][]) =>
    `<g fill="${fill}">${list.map(([x, b, h, w]) => `<path d="${pine(x, b, h, w)}"/>`).join("")}</g>`;

const SCENES: Record<RoleId, Scene> = {
    werewolf: {
        wolf: true,
        sky: ["#12030a", "#4a0c1a"],
        crop: "44 14 210 210",
        draw: (p, full) => `
${moon(p + "m", 160, 128, 88, "#ffc06a", "#c2452e", "#ff7a3a")}
${full ? pines("#1c050c", [[30, 336, 96, 42], [58, 344, 74, 34]]) : ""}
${fog(p + "fg", 256, 90, "#a8303a", 0.35)}
<path d="M66 108 Q102 122 138 134 Q108 140 80 146Z" fill="#5e0a16"/>
<path d="M86 142 Q106 132 126 134 Q108 142 86 144Z" fill="#b02a3a"/>
<path d="M74 111 L84 115 L78 133Z M94 118 L102 121 L98 132Z M110 124 L116 126 L113 133Z M84 145 L92 144 L88 128Z M102 142 L108 141 L105 133Z" fill="#f6ead2"/>
<path d="M186 52 L199 12 Q212 40 222 72Z" fill="#2c0812"/>
${rimmed(
    p + "w",
    "M58 98 L64 86 Q96 72 128 68 Q142 56 158 54 L176 8 Q192 34 206 60 Q224 80 230 106 L248 124 L237 132 L260 158 L247 165 L270 196 L255 201 L280 240 L265 243 L290 290 L274 292 L298 340 V420 H80 L86 362 L72 344 L96 330 L80 312 L104 298 L92 280 L114 266 L106 248 Q112 214 126 196 Q104 178 76 152 L80 146 Q108 140 138 134 Q102 122 66 108Z",
    "#14050b",
    "#f0703a",
    4,
    -3,
)}
<path d="M142 100 Q178 108 198 146 L186 146 L198 176 L184 172 L190 206 L174 196 L172 224 Q146 200 140 172 Q154 136 142 100Z" fill="#2c0a14"/>
<path d="M68 96 Q100 86 136 88 Q148 98 138 108 Q102 108 70 104Z" fill="#240810"/>
<path d="M172 28 L166 56 L190 60Z" fill="#3b0c18"/>
<g fill="none" stroke="#5a1626" stroke-width="3" stroke-linecap="round"><path d="M206 116 Q224 160 212 204 M226 214 Q240 266 228 318 M128 200 Q118 250 126 300"/></g>
<circle cx="60" cy="96" r="4" fill="#000"/>
${halo(p + "e", 154, 80, 24, "#ffc94a", 0.85)}
<path d="M140 82 Q152 68 168 74 Q155 87 140 82Z" fill="#ffc94a"/>
<path d="M152 76 Q155 74 157 77 Q154 83 152 76Z" fill="#3a0a00"/>`,
    },

    villager: {
        wolf: false,
        sky: ["#0a1030", "#1e3b54"],
        crop: "80 130 156 156",
        draw: (p, full) => `
${moon(p + "m", 80, 86, 32, "#ffe6b8", "#d8a868", "#ffd59a")}
${full ? stars([[150, 40, 1.2], [210, 60, 1.6], [250, 36, 1.1], [240, 110, 1.3], [36, 150, 1.2], [120, 70, 1.1]]) : ""}
${rg(p + "win", [[0, "#ffb347", 0.9], [1, "#ffb347", 0]])}
<path d="M16 262 Q80 236 150 250 T284 240 L284 420 L16 420Z" fill="#13233a"/>
<g fill="#0a1424"><path d="M30 256 V234 L54 212 L80 234 V256Z M66 222 V208 h7 v20Z"/><path d="M214 250 V228 L240 206 L266 228 V250Z"/></g>
<g fill="url(#${p}win)"><circle cx="46" cy="243" r="11"/><circle cx="64" cy="243" r="11"/><circle cx="232" cy="237" r="11"/><circle cx="250" cy="237" r="11"/></g>
<g fill="#ffbe5c"><rect x="42" y="239" width="8" height="8"/><rect x="60" y="239" width="8" height="8"/><rect x="228" y="233" width="8" height="8"/><rect x="246" y="233" width="8" height="8"/></g>
${fog(p + "fg", 240, 80, "#7aa0c8", 0.25)}
<path d="M16 300 Q150 282 284 300 L284 420 L16 420Z" fill="#0b1524"/>
${rimmed(
    p + "c",
    "M150 104 C188 110 206 146 204 182 C203 200 198 212 206 228 C236 270 250 340 262 420 L38 420 C50 340 64 270 94 228 C102 212 97 200 96 182 C94 146 112 110 150 104Z",
    "#3a2e40",
    "#b4cae6",
    -3,
    -2,
)}
<path d="M122 240 Q110 320 100 420 M150 250 V420" fill="none" stroke="#17111c" stroke-width="3" opacity=".7"/>
${halo(p + "l", 204, 290, 130, "#ff9a3c", 0.55)}
<ellipse cx="150" cy="178" rx="28" ry="34" fill="#4a3846"/>
<ellipse cx="150" cy="180" rx="24" ry="30" fill="#140c12"/>
${lg(p + "f", [[0, "#4a2a22"], [0.45, "#a0603e"], [1, "#ffbf80"]])}
<ellipse cx="150" cy="187" rx="18" ry="23" fill="url(#${p}f)"/>
<path d="M139 184 q5 3 9 0 M153 184 q5 3 9 0" fill="none" stroke="#2a140e" stroke-width="2" stroke-linecap="round"/>
<path d="M146 199 q4 2 8 0" fill="none" stroke="#6a3020" stroke-width="2" stroke-linecap="round"/>
${lg(p + "a", [[0, "#3a2e40"], [1, "#9a6648"]])}
<path d="M184 212 C204 224 215 240 212 258 L196 260 C196 246 190 236 178 230Z" fill="url(#${p}a)"/>
<circle cx="204" cy="256" r="7" fill="#ffbf80"/>
${halo(p + "k", 204, 292, 46, "#ffd27a", 0.9)}
${lg(p + "g", [[0, "#fff6d0"], [0.6, "#ffc25a"], [1, "#ff8a2a"]])}
<path d="M195 266 Q204 252 213 266" fill="none" stroke="#2a1a10" stroke-width="2.5"/>
<path d="M189 266 H219 L214 276 H194Z M190 310 H218 V316 H190Z" fill="#2a1a10"/>
<rect x="193" y="276" width="22" height="34" rx="4" fill="url(#${p}g)" stroke="#2a1a10" stroke-width="2"/>
<path d="M204 276 V310" stroke="#2a1a10" stroke-width="2"/>
<path d="M204 284 Q210 294 204 302 Q198 294 204 284Z" fill="#fff"/>`,
    },

    seer: {
        wolf: false,
        sky: ["#0a0520", "#2c1050"],
        crop: "42 74 216 216",
        draw: (p, full) => `
${full ? stars([[40, 130, 1.4], [60, 200, 1.1], [250, 140, 1.6], [236, 210, 1.2], [200, 40, 1.3], [260, 60, 1.1], [120, 36, 1.5], [30, 250, 1.2], [270, 250, 1.4]]) + sparkle(228, 96, 8, "#f6d8ff") + sparkle(46, 300, 6, "#f6d8ff") : ""}
${halo(p + "mh", 76, 80, 60, "#d0b8ff", 0.35)}
<path d="M86 52 A30 30 0 1 0 104 98 A24 24 0 1 1 86 52Z" fill="#efe4ff"/>
${lg(p + "r", [[0, "#40206e"], [1, "#160a2c"]])}
${rimmed(
    p + "h",
    "M150 58 C200 62 226 120 226 180 C226 214 236 240 258 270 C272 300 280 360 284 420 L16 420 C20 360 28 300 42 270 C64 240 74 214 74 180 C74 120 100 62 150 58Z",
    `url(#${p}r)`,
    "#b89cff",
    -3,
    -2,
)}
<path d="M150 92 C184 94 196 130 194 170 C192 200 178 222 150 226 C122 222 108 200 106 170 C104 130 116 94 150 92Z" fill="#06020e" stroke="${GOLD}" stroke-width="2" stroke-opacity=".8"/>
${halo(p + "c", 150, 214, 40, "#e070ff", 0.45)}
${halo(p + "eg", 150, 166, 30, "#f0a0ff", 0.25)}
<path d="M127 167 Q136 160 145 167 Q136 172 127 167Z M155 167 Q164 160 173 167 Q164 172 155 167Z" fill="#f6c4ff"/>
${halo(p + "bh", 150, 280, 130, "#d86bff", 0.6)}
${rg(p + "b", [[0, "#fff"], [0.25, "#f6caff"], [0.65, "#b45cf0"], [1, "#43128a"]], ' fx=".38" fy=".34"')}
<circle cx="150" cy="280" r="38" fill="url(#${p}b)"/>
<path d="M128 288 Q150 268 172 284 M134 298 Q152 286 166 298" fill="none" stroke="#fff" stroke-width="2" opacity=".45"/>
<ellipse cx="137" cy="264" rx="10" ry="6" transform="rotate(-30 137 264)" fill="#fff" opacity=".75"/>
${lg(p + "k", [[0, "#4a2470"], [1, "#f0c4ff"]], 'x2="1" y2="0"')}
${mirrored(p + "hd", "M106 318 C100 300 104 276 116 262 C122 257 127 262 124 270 C121 286 128 304 150 313 V323 C132 330 112 328 106 318Z M112 284 q6 2 10 0 M110 298 q7 2 12 0", `fill="url(#${p}k)" stroke="#2a0f48" stroke-width="1.2"`)}
${mirrored(p + "sl", "M66 354 C76 324 96 310 112 314 L124 342 C104 356 84 360 66 354Z", `fill="#2e1456" stroke="${GOLD}" stroke-opacity=".7" stroke-width="1.5"`)}`,
    },

    doctor: {
        wolf: false,
        sky: ["#06161b", "#11393b"],
        crop: "44 34 196 196",
        draw: (p, full) => `
${moon(p + "m", 206, 92, 62, "#f2ead6", "#b8b096", "#bfeee2")}
${full ? `<path d="M16 296 V268 L36 250 L56 268 V258 H76 V240 L96 222 L116 240 V280 H130 V262 L150 246 L170 262 V284 H230 V256 L250 238 L270 256 V270 H284 V420 H16Z" fill="#0a2428"/>
<g fill="#5fd0c0" opacity=".7"><rect x="92" y="246" width="6" height="8"/><rect x="246" y="262" width="6" height="8"/></g>` : ""}
${fog(p + "fg", 250, 80, "#7fd6c6", 0.18)}
${rimmed(p + "c", "M92 230 C84 300 72 360 64 420 H272 C264 360 252 300 244 230Z", "#0f1518", "#7fd6c6", 3, -3)}
<path d="M120 296 Q114 360 108 420 M214 296 Q222 360 228 420" fill="none" stroke="#05090b" stroke-width="3"/>
${rimmed(
    p + "k",
    "M88 214 C118 194 218 194 248 214 C256 240 254 264 244 280 C204 294 132 294 92 280 C82 264 80 240 88 214Z",
    "#182226",
    "#7fd6c6",
    3,
    -3,
)}
<path d="M130 118 C118 150 118 182 128 204 H212 C222 178 222 146 210 118Z" fill="#1c2629"/>
<path d="M124 190 L142 224 H198 L216 190 L198 210 H142Z" fill="#26343a"/>
${lg(p + "b", [[0, "#efe3c4"], [1, "#8e7a58"]])}
<path d="M140 128 C150 112 196 112 205 140 C211 168 198 194 176 197 C160 199 146 190 140 176Z" fill="url(#${p}b)"/>
<path d="M146 132 C120 146 86 176 56 216 C92 202 126 192 154 182Z" fill="url(#${p}b)"/>
<path d="M56 216 C92 202 126 192 154 182 L150 174 C120 186 90 198 56 216Z" fill="#6e5a3c"/>
<path d="M118 154 L130 188 M96 172 L104 198" stroke="#6a5438" stroke-width="2" fill="none"/>
${rg(p + "l", [[0, "#e8fff9"], [0.45, "#58d0c0"], [1, "#0b4446"]], ' fx=".35" fy=".35"')}
<circle cx="192" cy="142" r="10" fill="url(#${p}l)" stroke="#6b5530" stroke-width="3"/>
<circle cx="157" cy="146" r="13" fill="url(#${p}l)" stroke="#6b5530" stroke-width="4"/>
<path d="M150 140 q4 -4 9 -3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
<g transform="rotate(-6 168 112)">
<ellipse cx="168" cy="114" rx="102" ry="19" fill="#0b1012"/>
${rimmed(p + "t", "M124 114 L134 66 C152 58 186 58 202 66 L212 112Z", "#10171a", "#7fd6c6", 3, -2)}
<path d="M127 98 L209 97 L210 108 L126 110Z" fill="#2f7f78"/>
<path d="M66 114 A102 19 0 0 0 270 114 A102 9 0 0 1 66 114Z" fill="#1c2629"/></g>
<path d="M174 252 H200 V270 C200 282 187 290 187 290 C187 290 174 282 174 270Z" fill="#e6dcc2" stroke="#2f7f78" stroke-width="2"/>
<path d="M184 258 H190 V265 H196 V271 H190 V280 H184 V271 H178 V265 H184Z" fill="#2f7f78"/>`,
    },

    hunter: {
        wolf: false,
        sky: ["#06141a", "#16322a"],
        crop: "58 40 186 186",
        draw: (p, full) => `
${moon(p + "m", 214, 100, 46, "#ffd890", "#d08a3a", "#ffb04a")}
${pines("#0e2a22", [[30, 300, 150, 60], [262, 296, 170, 66], [236, 300, 120, 48]])}
${full ? pines("#06130f", [[40, 336, 210, 80], [272, 338, 200, 74]]) : ""}
${fog(p + "fg", 240, 90, "#9ac8a0", 0.18)}
<path d="M16 320 Q150 300 284 320 V420 H16Z" fill="#06130f"/>
<g transform="rotate(24 206 210)"><rect x="196" y="158" width="22" height="92" rx="6" fill="#4a2e1a"/>
<path d="M201 158 V124 M207 158 V120 M213 158 V126" stroke="#a8865a" stroke-width="2.5"/>
<path d="M201 112 l-5 10 l5 8 l5 -8Z" fill="#c8452a"/><path d="M207 108 l-5 10 l5 8 l5 -8Z" fill="#e8dcc0"/><path d="M213 114 l-5 10 l5 8 l5 -8Z" fill="#e8a23a"/></g>
<path d="M98 236 C88 300 74 360 64 420 H236 C226 360 212 300 202 236Z" fill="#17301f"/>
<path d="M192 226 L112 340" stroke="#3a2614" stroke-width="7"/>
${rimmed(
    p + "k",
    "M100 214 C120 200 180 200 200 214 C214 230 222 252 226 272 L214 262 L206 278 L194 266 L184 282 L172 268 L160 284 L150 270 L140 284 L128 268 L116 282 L106 266 L94 278 L86 262 L74 272 C78 252 86 230 100 214Z",
    "#2a4e31",
    "#f0a63a",
    3,
    -3,
)}
${rimmed(
    p + "h",
    "M150 110 C184 110 198 140 198 170 C198 198 190 216 178 226 H122 C110 216 102 198 102 170 C102 140 116 110 150 110Z",
    "#2f5836",
    "#f0a63a",
    3,
    -3,
)}
<ellipse cx="150" cy="178" rx="25" ry="31" fill="#08120c"/>
${lg(p + "f", [[0, "#2a1810"], [0.45, "#8a5636"], [1, "#d89462"]])}
<ellipse cx="150" cy="184" rx="18" ry="23" fill="url(#${p}f)"/>
<path d="M138 175 l9 3 M162 175 l-9 3" stroke="#1a0e08" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="143" cy="181" r="1.8" fill="#ffd890"/><circle cx="157" cy="181" r="1.8" fill="#ffd890"/>
<path d="M135 192 Q150 214 165 192 Q150 204 135 192Z" fill="#3a2214" opacity=".75"/>
<path d="M98 228 C86 230 76 230 64 226 L66 242 C78 246 90 246 102 246Z" fill="#2a4e31"/>
<path d="M78 104 C70 112 66 120 68 128 C54 170 52 290 68 332 C66 340 70 348 78 356" fill="none" stroke="#7a4e2a" stroke-width="6" stroke-linecap="round"/>
<path d="M78 104 V356" stroke="#e8dcc0" stroke-width="1.2"/>
<rect x="54" y="222" width="14" height="22" rx="3" fill="#3a2614"/>
<circle cx="64" cy="234" r="9" fill="#a8703e"/>
<path d="M194 120 C214 96 236 64 254 38 C246 64 226 98 200 126Z" fill="#c8452a"/>
<path d="M196 122 C216 98 236 68 252 42" stroke="#6a1a10" stroke-width="1.5" fill="none"/>
${rimmed(p + "cap", "M96 144 Q130 96 208 110 L198 136 Q150 128 96 144Z", "#6a4224", "#f0a63a", 2, -2)}
<path d="M96 144 Q150 128 198 136 L204 146 Q150 138 92 152Z" fill="#3e2412"/>`,
    },

    witch: {
        wolf: false,
        sky: ["#11071e", "#2c1242"],
        crop: "44 24 212 212",
        draw: (p, full) => `
${moon(p + "m", 178, 92, 60, "#ece2ff", "#a08cd0", "#c8a8ff")}
${full ? stars([[40, 60, 1.4], [70, 120, 1.1], [250, 180, 1.3], [36, 220, 1.2], [262, 40, 1.5], [110, 40, 1.1]]) : ""}
${halo(p + "g", 150, 270, 150, "#7dff5a", 0.5)}
${rimmed(
    p + "r",
    "M110 206 C126 196 174 196 190 206 C214 230 228 300 236 420 L64 420 C72 300 86 230 110 206Z",
    "#2a1640",
    "#9b4dff",
    0,
    -3,
)}
${mirrored(p + "hr", "M114 156 C100 186 98 222 86 254 C100 256 114 250 122 240 C118 212 124 184 130 162Z", 'fill="#120a1e"')}
${lg(p + "f", [[0, "#141c14"], [0.45, "#3c6a3a"], [1, "#a8ff8a"]])}
<ellipse cx="150" cy="182" rx="20" ry="25" fill="url(#${p}f)"/>
<path d="M139 180 q4 -3 8 0 M153 180 q4 -3 8 0" stroke="#d8ff9a" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M144 196 q7 4 12 -2" stroke="#1a2a14" stroke-width="2" fill="none" stroke-linecap="round"/>
${rimmed(
    p + "h",
    "M98 152 C118 128 132 100 142 62 C148 40 160 30 186 22 C172 36 166 50 168 72 C172 102 182 128 204 152Z",
    "#1c1030",
    "#c8a8ff",
    3,
    -2,
)}
<ellipse cx="150" cy="153" rx="80" ry="14" fill="#170c26"/>
<path d="M112 140 C130 146 170 146 190 140 L193 148 C170 154 130 154 109 148Z" fill="#5a2a8a"/>
${mirrored(p + "sl", "M112 208 C96 220 82 232 70 236 L60 258 C78 262 96 254 114 240Z", 'fill="#3a2054"')}
<circle cx="70" cy="242" r="7" fill="#8ad070"/><circle cx="230" cy="242" r="7" fill="#8ad070"/>
${rg(p + "vr", [[0, "#ffb0a0"], [0.5, "#e02a3a"], [1, "#6a0a18"]], ' fx=".35" fy=".35"')}
<circle cx="70" cy="220" r="15" fill="url(#${p}vr)" stroke="#f0e0ff" stroke-width="1.5" stroke-opacity=".6"/>
<path d="M65 198 h10 v8 h-10Z" fill="#d0c0e0" opacity=".8"/><rect x="64" y="192" width="12" height="7" rx="2" fill="#8a5a3a"/>
${lg(p + "vg", [[0, "#d0ffb0"], [0.5, "#5ae03a"], [1, "#1a6a10"]], 'x2="1" y2="0"')}
<path d="M222 192 h16 v40 a8 8 0 0 1 -16 0Z" fill="url(#${p}vg)" stroke="#f0e0ff" stroke-width="1.5" stroke-opacity=".6"/>
<rect x="221" y="184" width="18" height="8" rx="2" fill="#8a5a3a"/>
<path d="M82 270 C78 322 110 346 150 346 C190 346 222 322 218 270Z" fill="#0c0b12"/>
<path d="M90 290 C100 320 120 334 140 338" stroke="#7dff5a" stroke-width="2" fill="none" opacity=".35"/>
<ellipse cx="150" cy="270" rx="72" ry="13" fill="#1e1c2a"/>
${rg(p + "lq", [[0, "#e8ffc8"], [0.5, "#8aff5a"], [1, "#2a9a1a"]])}
<ellipse cx="150" cy="270" rx="62" ry="8" fill="url(#${p}lq)"/>
<g fill="#b8ff9a"><circle cx="128" cy="264" r="6"/><circle cx="166" cy="261" r="4.5"/><circle cx="150" cy="248" r="3.5" opacity=".8"/><circle cx="176" cy="238" r="2.5" opacity=".6"/><circle cx="134" cy="232" r="2" opacity=".5"/></g>`,
    },
};

function border(p: string): string {
    return `${lg(p + "g", [[0, "#f6dc9a"], [0.5, "#b0823c"], [1, "#f0cf86"]], 'x2="1" y2="1"')}
<rect x="9" y="9" width="282" height="402" rx="12" fill="none" stroke="url(#${p}g)" stroke-width="2"/>
<rect x="16" y="16" width="268" height="388" rx="8" fill="none" stroke="${GOLD}" stroke-opacity=".5"/>
<g id="${p}f" fill="none" stroke="url(#${p}g)" stroke-width="1.5"><path d="M22 74 C22 42 42 22 74 22 M22 74 c0 7 7 9 9 4 M74 22 c7 0 9 7 4 9"/><path d="M30 23 L37 30 L30 37 L23 30Z" fill="${GOLD}"/></g>
<use href="#${p}f" transform="matrix(-1 0 0 1 300 0)"/>
<use href="#${p}f" transform="matrix(1 0 0 -1 0 420)"/>
<use href="#${p}f" transform="matrix(-1 0 0 -1 300 420)"/>`;
}

function card(id: RoleId, lang: Lang): string {
    const s = SCENES[id];
    const b = BANNER[lang];
    const label = t(lang).roles[id].name;
    const p = `wwc-${id}-`;
    const mark = s.wolf
        ? `<path d="M144 9 Q148 16 145 24 M150 8 Q154 16 151 25 M156 9 Q160 16 157 24" fill="none" stroke="#e04a4a" stroke-width="2" stroke-linecap="round"/>`
        : `<path d="M153 8 A8.5 8.5 0 1 0 158 22 A7 7 0 1 1 153 8Z" fill="${GOLD}"/>`;
    return min(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>${lg(p + "sky", [[0, s.sky[0]], [1, s.sky[1]]])}
${lg(p + "v", [[0, "#000", 0.35], [0.22, "#000", 0], [0.68, "#000", 0], [1, "#000", 0.75]])}
<clipPath id="${p}c"><rect x="16" y="16" width="268" height="388" rx="8"/></clipPath></defs>
<rect width="300" height="420" rx="16" fill="#0e080d"/>
<g clip-path="url(#${p}c)"><rect width="300" height="420" fill="url(#${p}sky)"/>${s.draw(p + "s", true)}<rect width="300" height="420" fill="url(#${p}v)"/></g>
${border(p)}
<path d="M46 356 H18 L28 369 L18 382 H46Z M254 356 H282 L272 369 L282 382 H254Z" fill="#0c070b" stroke="url(#${p}g)" stroke-width="1.2"/>
<path d="M40 350 H260 L266 367 L260 384 H40 L34 367Z" fill="#170d14" stroke="url(#${p}g)" stroke-width="1.5"/>
<text x="${150 + b.spacing / 2}" y="374" text-anchor="middle" font-family="${b.font}" font-size="${b.size}" font-weight="${b.weight}" letter-spacing="${b.spacing}" fill="${GOLD}">${b.upper ? label.toUpperCase() : label}</text>
<circle cx="150" cy="16" r="12" fill="#140b12" stroke="url(#${p}g)" stroke-width="1.5"/>${mark}</svg>`);
}

function portrait(id: RoleId): string {
    const s = SCENES[id];
    const p = `wwp-${id}-`;
    return min(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<defs>${lg(p + "sky", [[0, s.sky[0]], [1, s.sky[1]]])}</defs>
<svg width="200" height="200" viewBox="${s.crop}"><rect width="300" height="420" fill="url(#${p}sky)"/>${s.draw(p + "s", false)}</svg></svg>`);
}

const phase = (cx: number, cy: number, k: number, right: boolean) => {
    const r = 8;
    const s = right ? 1 : 0;
    const inner = Math.abs(k) * r;
    const lit =
        k >= 1
            ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${GOLD}"/>`
            : `<path d="M${cx} ${cy - r}A${r} ${r} 0 0 ${s} ${cx} ${cy + r}A${inner} ${r} 0 0 ${k < 0 ? 1 - s : s} ${cx} ${cy - r}Z" fill="${GOLD}"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${GOLD}" stroke-opacity=".6"/>${lit}`;
};

const moonRow = (y: number) =>
    phase(94, y, -0.5, true) + phase(122, y, 0, true) + phase(150, y, 1, true) + phase(178, y, 0, false) + phase(206, y, -0.5, false);

const rays = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    const r0 = 78;
    const r1 = i % 2 ? 90 : 100;
    const f = (n: number) => n.toFixed(1);
    return `M${f(150 + r0 * Math.cos(a))} ${f(210 + r0 * Math.sin(a))}L${f(150 + r1 * Math.cos(a))} ${f(210 + r1 * Math.sin(a))}`;
}).join("");

export const CARD_BACK: string = min(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>${rg("wwb-bg", [[0, "#1a2550"], [1, "#070b1c"]], ' r=".75"')}
<pattern id="wwb-lat" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M12 0 L24 12 L12 24 L0 12Z" fill="none" stroke="${GOLD}" stroke-opacity=".14"/></pattern>
${rg("wwb-eye", [[0, "#fff1b0"], [0.5, "#ffc94a"], [1, "#b8641a"]])}</defs>
<rect width="300" height="420" rx="16" fill="url(#wwb-bg)"/>
<rect x="16" y="16" width="268" height="388" rx="8" fill="url(#wwb-lat)"/>
${border("wwb-")}
${moonRow(52)}${moonRow(368)}
<g fill="none" stroke="${GOLD}"><circle cx="150" cy="210" r="72" stroke-width="1.5"/><circle cx="150" cy="210" r="64" stroke-opacity=".5"/><path d="${rays}" stroke-opacity=".7"/>
<path d="M150 82 L156 104 L150 110 L144 104Z M150 338 L156 316 L150 310 L144 316Z" fill="${GOLD}"/></g>
<path d="M170 152 A60 60 0 1 0 170 268 A48 48 0 1 1 170 152Z" fill="${GOLD}" opacity=".9"/>
<path d="M112 210 Q150 176 188 210 Q150 244 112 210Z" fill="#0b1026" stroke="${GOLD}" stroke-width="2"/>
<circle cx="150" cy="210" r="17" fill="url(#wwb-eye)"/>
<path d="M150 194 Q155 210 150 226 Q145 210 150 194Z" fill="#1a0a04"/>
<circle cx="145" cy="204" r="3" fill="#fff" opacity=".8"/></svg>`);

export const ACTION_ICON: string = min(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
<defs><clipPath id="wwi-c"><circle cx="12" cy="12" r="10.5"/></clipPath></defs>
<circle cx="12" cy="12" r="10.5" fill="#f4c45a" stroke="#5a2a10" stroke-width="1.2"/>
<path clip-path="url(#wwi-c)" d="M3.2 9.4 L4.8 7.8 L9.4 6.4 L11.2 6 L12.8 1.8 L15 6.4 Q17.4 9 18 12 L20.4 14.8 L19 15.2 L21.6 19 L20 19.2 L23 24 H7 L8.2 20 L7 18.8 L9 16.4 Q9.4 13.6 10.4 12.2 L5.4 11.2 L6 10.4 L10.2 10.2 L4.2 10.4Z" fill="#2a0a12"/></svg>`);

const build = (f: (id: RoleId) => string) =>
    Object.fromEntries((Object.keys(SCENES) as RoleId[]).map((id) => [id, f(id)])) as Record<RoleId, string>;

const cards = new Map<Lang, Record<RoleId, string>>();

/** Every role card with its banner in `lang`. */
export function cardArt(lang: Lang): Record<RoleId, string> {
    let set = cards.get(lang);
    if (!set) {
        set = build((id) => card(id, lang));
        cards.set(lang, set);
    }
    return set;
}
export const PORTRAIT: Record<RoleId, string> = build(portrait);

export function svgDataUrl(svg: string): string {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
