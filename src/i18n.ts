import type { DeathCause, GameEvent, Pace, Phase, PlayerId } from "./engine";
import type { RoleId, Team } from "./roles";

export type Lang = "en" | "th" | "zh";

export const LANGS: { id: Lang; label: string; short: string }[] = [
    { id: "en", label: "English", short: "EN" },
    { id: "th", label: "ไทย", short: "TH" },
    { id: "zh", label: "中文", short: "中" },
];

export function detectLang(tag: string | undefined): Lang {
    const t = (tag ?? "").toLowerCase();
    if (t.startsWith("th")) return "th";
    if (t.startsWith("zh")) return "zh";
    return "en";
}

export function isLang(v: unknown): v is Lang {
    return v === "en" || v === "th" || v === "zh";
}

/** Why the host cannot deal yet. */
export type DeckProblem =
    | { code: "min"; n: number }
    | { code: "max"; n: number }
    | { code: "size"; cards: number; players: number }
    | { code: "no-wolf" }
    | { code: "too-many-wolves" }
    | { code: "one-special"; role: RoleId };

/** Messages the driver shows above the panel. */
export type Notice =
    | { code: "game-running" }
    | { code: "table-full" }
    | { code: "cannot-speak" }
    | { code: "need-collab" }
    | { code: "need-access" }
    | { code: "secrets-elsewhere" }
    | { code: "failed"; detail: string }
    | { code: "deck"; problem: DeckProblem };

export type TownClosed = "" | "join" | "watching" | "dead" | "night";

type RoleText = { name: string; blurb: string; power: string | null };

export type Strings = {
    appName: string;
    tagline: string;
    menuTitle: string;
    heroText: string;
    language: string;
    narrateTitle: string;
    narrateDetail: string;
    gather: string;
    howToPlay: string;
    rules: string[];
    loading: string;

    roles: Record<RoleId, RoleText>;
    /** "2 Werewolves" / "Seer". */
    roleCount: (role: RoleId, n: number) => string;
    teams: Record<Team, string>;

    you: (name: string) => string;
    narrator: (name: string) => string;
    someone: string;
    aWolf: string;
    nobody: string;
    away: string;

    atTable: string;
    noSeats: string;
    leave: string;
    takeSeat: string;
    deck: string;
    deckCount: (cards: number, players: number) => string;
    suggested: (n: number) => string;
    pace: string;
    paces: Record<Pace, string>;
    deal: string;
    waitingDeal: (host: string) => string;
    fewer: (role: string) => string;
    more: (role: string) => string;

    phaseTitle: (phase: Phase, day: number, winner: Team | null) => string;
    phaseSub: (phase: Phase, seated: number, host: string) => string;
    boardSub: (phase: Phase) => string;
    transition: (phase: Phase, day: number, winner: Team | null, hasPower: boolean) => { title: string; sub: string } | null;

    hostAway: (host: string) => string;
    watching: string;
    prompt: {
        kill: [string, string];
        inspect: [string, string];
        protect: [string, string];
        protectRepeat: string;
        witch: [string, string];
        ready: [string, string];
        vote: [string, string];
        shoot: [string, string];
    };
    act: (kind: "kill" | "inspect" | "protect" | "vote" | "shoot", name: string) => string;
    readyStatus: (ready: number, alive: number) => string;
    readyButton: (ready: number, alive: number) => string;
    waiting: string;
    sending: string;
    heldFire: string;
    skipped: string;
    tapToChange: string;
    tapPlayer: string;
    holdFire: string;
    skip: string;

    witch: {
        done: string;
        victim: (name: string) => string;
        noVictim: string;
        saving: (name: string) => string;
        heal: string;
        healHint: string;
        healSpent: string;
        poisoning: (name: string) => string;
        poison: string;
        poisonPick: string;
        poisonCancel: string;
        poisonSpent: string;
        brewing: string;
        brew: string;
        nothing: string;
    };

    asleep: string;
    sleepWolf: string;
    sleepWitch: string;
    sleepOther: string;
    died: string;
    diedText: string;
    visions: string;
    reading: (day: number, name: string, isWolf: boolean) => string;
    pipWolf: string;
    pipSafe: string;
    village: string;
    aliveOf: (alive: number, total: number) => string;
    tagDead: string;
    tagDeadRole: (role: string) => string;
    tagVotedSkip: string;
    tagReady: string;
    tagSeerWolf: string;
    tagSeerSafe: string;
    hosting: string;
    narrating: string;
    skipTimer: string;
    endGame: string;
    tapAgain: string;

    overTitle: (winner: Team | null) => string;
    verdict: (winner: Team | null, mine: Team | null) => string;
    everyCard: string;
    diedSuffix: string;
    playAgain: string;
    showTable: string;

    square: string;
    pack: string;
    tabVillage: string;
    tabChat: string;
    emptyNoGame: string;
    emptyPack: string;
    emptyTown: string;
    packOnlyNight: string;
    townClosed: Record<Exclude<TownClosed, "">, string>;
    placeholderTown: string;
    placeholderPack: string;
    charsLeft: (n: number) => string;
    send: string;
    message: string;

    teamPack: string;
    teamVillage: string;
    yourPack: (names: string) => string;
    gotIt: string;
    yourRole: (role: string) => string;

    seatedN: (n: number) => string;
    cardsInDeck: (n: number) => string;
    hostedBy: (name: string) => string;
    noSeatsYet: string;
    votes: (n: number) => string;
    readyToVote: string;
    aiming: string;
    squareTitle: string;
    nothingSaid: string;

    notice: (n: Notice) => string;
    problem: (p: DeckProblem) => string;
    event: (e: GameEvent, name: (id: PlayerId) => string) => string;
};

// ---------------------------------------------------------------------------
// English

const enRoles: Record<RoleId, RoleText & { plural: string; article: string }> = {
    werewolf: {
        name: "Werewolf",
        plural: "Werewolves",
        article: "a",
        blurb: "Hunt by night. Blend in by day.",
        power: "Agree with your pack on one villager to devour.",
    },
    villager: { name: "Villager", plural: "Villagers", article: "a", blurb: "No powers, only wits. Find the wolves.", power: null },
    seer: {
        name: "Seer",
        plural: "Seers",
        article: "the",
        blurb: "Each night, learn whether one player is a wolf.",
        power: "Choose a player to read their true nature.",
    },
    doctor: {
        name: "Doctor",
        plural: "Doctors",
        article: "the",
        blurb: "Each night, shield one player from the wolves.",
        power: "Choose someone to protect. Not the same person two nights running.",
    },
    hunter: { name: "Hunter", plural: "Hunters", article: "the", blurb: "When you fall, you take one player with you.", power: null },
    witch: {
        name: "Witch",
        plural: "Witches",
        article: "the",
        blurb: "One potion to save a life, one to take it.",
        power: "Heal the wolves' victim or poison anyone. Each once per game.",
    },
};

const s = (n: number) => (n === 1 ? "" : "s");

const en: Strings = {
    appName: "Werewolf",
    tagline: "A game of lies under the moon",
    menuTitle: "Play Werewolf",
    heroText: "Wolves hide among the villagers. Each night they hunt; each day the village votes to find them. Talk, deduce, and lie well.",
    language: "Language",
    narrateTitle: "Narrate instead of playing",
    narrateDetail: "You run the table and see every role.",
    gather: "Gather the village",
    howToPlay: "How to play",
    rules: [
        "Everyone gets a secret role card. Werewolves know each other; nobody else knows anything.",
        "At night the wolves pick a victim. The Seer reads one player, the Doctor shields one, and the Witch may heal or poison.",
        "At dawn the dead are revealed. The village discusses in the Square, then votes to exile someone.",
        "The dead cannot speak. When the Hunter dies, they shoot one player on the way out.",
        "The village wins when every wolf is gone. The wolves win when they equal the villagers.",
    ],
    loading: "Lighting the lanterns…",

    roles: enRoles,
    roleCount: (r, n) => (n > 1 ? `${n} ${enRoles[r].plural}` : enRoles[r].name),
    teams: { village: "Village", wolves: "Wolves" },

    you: (n) => `${n} (you)`,
    narrator: (n) => `${n} (narrator)`,
    someone: "Someone",
    aWolf: "A wolf",
    nobody: "nobody",
    away: "away",

    atTable: "At the table",
    noSeats: "No one has taken a seat yet.",
    leave: "Leave the table",
    takeSeat: "Take a seat",
    deck: "The deck",
    deckCount: (c, p) => `${c} cards · ${p} players`,
    suggested: (n) => `Use the suggested deck for ${n}`,
    pace: "Pace",
    paces: { quick: "Quick", standard: "Standard", relaxed: "Relaxed" },
    deal: "Deal the cards",
    waitingDeal: (h) => `Waiting for ${h} to deal the cards.`,
    fewer: (r) => `Fewer: ${r}`,
    more: (r) => `More: ${r}`,

    phaseTitle: (phase, day, winner) =>
        ({
            lobby: "Gathering at the inn",
            night: `Night ${day}`,
            witch: `Night ${day}`,
            day: `Day ${day}`,
            vote: `Day ${day} · Vote`,
            hunter: "The Hunter's shot",
            over: winner === "wolves" ? "The wolves win" : winner === "village" ? "The village wins" : "Game over",
        })[phase],
    phaseSub: (phase, seated, host) =>
        ({
            lobby: `${seated} seated · hosted by ${host}`,
            night: "The village sleeps",
            witch: "A cauldron bubbles",
            day: "Discuss and accuse",
            vote: "Choose who leaves",
            hunter: "A final bolt",
            over: "All roles revealed",
        })[phase],
    boardSub: (phase) =>
        ({
            lobby: "Open the Werewolf panel to take a seat",
            night: "The village sleeps. Something stirs.",
            witch: "A cauldron bubbles in the dark.",
            day: "Talk it over. Who is lying?",
            vote: "The village must choose.",
            hunter: "One final bolt.",
            over: "Every card is turned over.",
        })[phase],
    transition: (phase, day, winner, hasPower) => {
        switch (phase) {
            case "night":
                return { title: `Night ${day}`, sub: hasPower ? "Your power awakens." : "Close your eyes." };
            case "day":
                return { title: `Day ${day}`, sub: "The sun rises on the village." };
            case "vote":
                return { title: "The vote", sub: "Point your finger." };
            case "hunter":
                return { title: "The Hunter falls", sub: "One last bolt remains." };
            case "over":
                return { title: en.overTitle(winner), sub: "Every card is turned over." };
            default:
                return null;
        }
    },

    hostAway: (h) => `${h} is away. The game continues when the host returns.`,
    watching: "You are watching this game. Take a seat when the next one gathers.",
    prompt: {
        kill: ["Choose your prey", "The night ends early once the whole pack points at the same victim."],
        inspect: ["Gaze into the crystal", "Choose one player. You will learn whether they are a werewolf."],
        protect: ["Watch over someone", "The wolves cannot kill whoever you protect tonight. You may choose yourself."],
        protectRepeat: "You cannot protect the same person two nights in a row.",
        witch: ["Your cauldron bubbles", "Each potion works once per game. Choose, then brew."],
        ready: ["Discuss, then vote", "When everyone alive is ready, voting begins."],
        vote: ["Who should leave the village?", "A player needs more votes than any other choice, skip included. Ties exile nobody."],
        shoot: ["Take your last shot", "You are dying. Choose who your bolt takes with you, or hold your fire."],
    },
    act: (kind, n) => ({ kill: `Devour ${n}`, inspect: `Read ${n}`, protect: `Protect ${n}`, vote: `Vote for ${n}`, shoot: `Shoot ${n}` })[kind],
    readyStatus: (r, a) => `Ready · ${r} of ${a}`,
    readyButton: (r, a) => `I'm ready to vote · ${r}/${a}`,
    waiting: "Waiting…",
    sending: "Sending…",
    heldFire: "You held your fire.",
    skipped: "You chose to skip.",
    tapToChange: "· tap another to change",
    tapPlayer: "Tap a player below.",
    holdFire: "Hold fire",
    skip: "Skip",

    witch: {
        done: "Your brew is done for tonight.",
        victim: (n) => `The wolves attacked ${n} tonight.`,
        noVictim: "No one lies dying tonight.",
        saving: (n) => `Saving ${n}`,
        heal: "Healing potion",
        healHint: "Tap to save tonight's victim.",
        healSpent: "Your healing potion is spent.",
        poisoning: (n) => `Poisoning ${n}`,
        poison: "Poison",
        poisonPick: "Tap a player below to poison them.",
        poisonCancel: "Tap them again below to cancel.",
        poisonSpent: "Your poison is spent.",
        brewing: "Brewing…",
        brew: "Brew",
        nothing: "Do nothing tonight",
    },

    asleep: "You are asleep",
    sleepWolf: "Your pack is deciding. Use the Pack chat to plot.",
    sleepWitch: "Wait for the wolves to choose. Your cauldron wakes after.",
    sleepOther: "Close your eyes. Listen for footsteps.",
    died: "You have died",
    diedText: "Ghosts cannot speak, but they see every role. Watch the village squirm.",
    visions: "Your visions",
    reading: (d, n, w) => `Night ${d}: ${n} ${w ? "is a werewolf." : "is not a werewolf."}`,
    pipWolf: "WOLF",
    pipSafe: "SAFE",
    village: "The village",
    aliveOf: (a, t) => `${a} of ${t} alive`,
    tagDead: "† dead",
    tagDeadRole: (r) => `† ${r}`,
    tagVotedSkip: "voted skip",
    tagReady: "ready",
    tagSeerWolf: "werewolf!",
    tagSeerSafe: "not a wolf",
    hosting: "You are hosting",
    narrating: "You are narrating",
    skipTimer: "Skip timer",
    endGame: "End game",
    tapAgain: "Tap again to end",

    overTitle: (w) => (w === "wolves" ? "The wolves feast" : w === "village" ? "The village survives" : "Game over"),
    verdict: (w, mine) => (!w ? "The game was ended early." : !mine ? "" : mine === w ? "Your side won." : "Your side lost."),
    everyCard: "Every card, turned over",
    diedSuffix: " · died",
    playAgain: "Play again",
    showTable: "Show table",

    square: "Village Square",
    pack: "Pack",
    tabVillage: "Village",
    tabChat: "Chat",
    emptyNoGame: "Start a game to open the Village Square.",
    emptyPack: "Only the pack can read this. Whisper your plans.",
    emptyTown: "No one has spoken yet.",
    packOnlyNight: "The pack only speaks at night.",
    townClosed: {
        join: "Join the table to chat.",
        watching: "You are watching this game. Join the next one to talk.",
        dead: "The dead cannot speak. Watch, and wait for the end.",
        night: "The village sleeps. The square opens again at dawn.",
    },
    placeholderTown: "Speak to the village…",
    placeholderPack: "Whisper to the pack…",
    charsLeft: (n) => `${n} left`,
    send: "Send",
    message: "Message",

    teamPack: "Werewolf pack",
    teamVillage: "Village",
    yourPack: (n) => `Your pack: ${n}`,
    gotIt: "Got it",
    yourRole: (r) => `Your role: ${r}`,

    seatedN: (n) => `${n} seated`,
    cardsInDeck: (n) => `${n} cards in the deck`,
    hostedBy: (n) => `Hosted by ${n}`,
    noSeatsYet: "No one has taken a seat yet.",
    votes: (n) => `${n} vote${s(n)}`,
    readyToVote: "ready to vote",
    aiming: "aiming…",
    squareTitle: "VILLAGE SQUARE",
    nothingSaid: "Nothing said yet.",

    notice: (n) => {
        switch (n.code) {
            case "game-running":
                return "A game is already running on this board.";
            case "table-full":
                return "The table is full.";
            case "cannot-speak":
                return "You cannot speak right now.";
            case "need-collab":
                return "Allow collaboration access so other players can see who you are.";
            case "need-access":
                return "Werewolf needs access to the board to play. Reopen the panel to allow it.";
            case "secrets-elsewhere":
                return "This game's secrets were sealed on another device. Return to it to keep hosting.";
            case "failed":
                return `Something went wrong: ${n.detail}`;
            case "deck":
                return en.problem(n.problem);
        }
    },
    problem: (p) => {
        switch (p.code) {
            case "min":
                return `Need at least ${p.n} players.`;
            case "max":
                return `At most ${p.n} players.`;
            case "size":
                return `The deck has ${p.cards} cards for ${p.players} players.`;
            case "no-wolf":
                return "The deck needs at least one werewolf.";
            case "too-many-wolves":
                return "Too many werewolves: they would win at once.";
            case "one-special":
                return `Only one ${enRoles[p.role].name} per game.`;
        }
    },
    event: (e, name) => {
        const role = (r: RoleId) => `${enRoles[r].article} ${enRoles[r].name}`;
        switch (e.kind) {
            case "phase":
                return {
                    "first-night": "Night falls on the village. Everyone, close your eyes.",
                    night: "Night falls again. Close your eyes.",
                    dawn: `Day ${e.day} dawns.`,
                    vote: "The village gathers to vote.",
                }[e.what];
            case "saved":
                return e.survived ? "The wolves struck, but their victim survived the night." : "Nobody died last night.";
            case "death": {
                const n = name(e.who);
                const r = role(e.role);
                const text: Record<DeathCause, string> = {
                    wolves: `${n} was found torn apart at dawn. They were ${r}.`,
                    poison: `${n} was found cold and still, a strange green stain on their lips. They were ${r}.`,
                    vote: `${n} is led out of the village. They were ${r}.`,
                    hunter: `The Hunter's bolt strikes ${n}. They were ${r}.`,
                };
                return text[e.cause];
            }
            case "vote":
                if (e.outcome === "exiled") return `The village exiles ${name(e.who)} with ${e.votes} vote${s(e.votes)}.`;
                return e.outcome === "split" ? "The vote is split. Nobody is exiled today." : "Nobody voted. Nobody is exiled today.";
            case "hunter":
                return `${name(e.who)} was the Hunter, and raises a crossbow with their last breath.`;
            case "hold-fire":
                return `${name(e.who)} lowers the crossbow. No shot is fired.`;
            case "ended":
                return "The host ended the game.";
            case "win":
                return e.team === "village" ? "The last wolf is gone. The village wins!" : "The wolves outnumber the villagers. The wolves win!";
        }
    },
};

// ---------------------------------------------------------------------------
// Thai

const thRoles: Record<RoleId, RoleText> = {
    werewolf: {
        name: "มนุษย์หมาป่า",
        blurb: "ล่าในยามค่ำคืน แฝงตัวในยามกลางวัน",
        power: "ตกลงกับฝูงของคุณว่าจะขย้ำชาวบ้านคนไหน",
    },
    villager: { name: "ชาวบ้าน", blurb: "ไม่มีพลังพิเศษ มีแค่ไหวพริบ จงหาตัวหมาป่าให้เจอ", power: null },
    seer: {
        name: "ผู้หยั่งรู้",
        blurb: "ทุกคืน รู้ได้ว่าผู้เล่นหนึ่งคนเป็นหมาป่าหรือไม่",
        power: "เลือกผู้เล่นหนึ่งคนเพื่อดูตัวตนที่แท้จริง",
    },
    doctor: {
        name: "หมอ",
        blurb: "ทุกคืน ปกป้องผู้เล่นหนึ่งคนจากหมาป่า",
        power: "เลือกคนที่จะปกป้อง ห้ามเลือกคนเดิมสองคืนติดกัน",
    },
    hunter: { name: "นายพราน", blurb: "เมื่อคุณตาย คุณจะพาผู้เล่นอีกหนึ่งคนไปด้วย", power: null },
    witch: {
        name: "แม่มด",
        blurb: "ยาหนึ่งขวดช่วยชีวิต อีกขวดพรากชีวิต",
        power: "ช่วยเหยื่อของหมาป่า หรือวางยาใครก็ได้ อย่างละครั้งต่อเกม",
    },
};

const th: Strings = {
    appName: "มนุษย์หมาป่า",
    tagline: "เกมแห่งการหลอกลวงใต้แสงจันทร์",
    menuTitle: "เล่นมนุษย์หมาป่า",
    heroText: "หมาป่าซ่อนตัวอยู่ท่ามกลางชาวบ้าน ทุกคืนพวกมันออกล่า ทุกวันหมู่บ้านต้องโหวตหาตัวพวกมัน พูดคุย สืบหา และโกหกให้แนบเนียน",
    language: "ภาษา",
    narrateTitle: "เป็นผู้ดำเนินเกมแทนการเล่น",
    narrateDetail: "คุณคุมโต๊ะและเห็นบทบาทของทุกคน",
    gather: "รวมพลชาวบ้าน",
    howToPlay: "วิธีเล่น",
    rules: [
        "ทุกคนได้การ์ดบทบาทลับ หมาป่ารู้จักกันเอง นอกนั้นไม่มีใครรู้อะไรเลย",
        "ตอนกลางคืน หมาป่าเลือกเหยื่อ ผู้หยั่งรู้ส่องดูผู้เล่นหนึ่งคน หมอปกป้องหนึ่งคน และแม่มดอาจช่วยชีวิตหรือวางยา",
        "เมื่อรุ่งสาง ผู้ตายจะถูกเปิดเผย หมู่บ้านถกเถียงกันที่ลานกลางหมู่บ้าน แล้วโหวตขับไล่ใครสักคน",
        "คนตายพูดไม่ได้ เมื่อนายพรานตาย เขาจะยิงผู้เล่นหนึ่งคนก่อนจากไป",
        "หมู่บ้านชนะเมื่อหมาป่าหมดไป หมาป่าชนะเมื่อมีจำนวนเท่ากับชาวบ้าน",
    ],
    loading: "กำลังจุดตะเกียง…",

    roles: thRoles,
    roleCount: (r, n) => (n > 1 ? `${thRoles[r].name} ×${n}` : thRoles[r].name),
    teams: { village: "ฝ่ายหมู่บ้าน", wolves: "ฝ่ายหมาป่า" },

    you: (n) => `${n} (คุณ)`,
    narrator: (n) => `${n} (ผู้ดำเนินเกม)`,
    someone: "ใครบางคน",
    aWolf: "หมาป่าตัวหนึ่ง",
    nobody: "ไม่มีใคร",
    away: "ไม่อยู่",

    atTable: "ที่โต๊ะ",
    noSeats: "ยังไม่มีใครนั่ง",
    leave: "ลุกจากโต๊ะ",
    takeSeat: "นั่งลง",
    deck: "สำรับการ์ด",
    deckCount: (c, p) => `${c} ใบ · ผู้เล่น ${p} คน`,
    suggested: (n) => `ใช้สำรับแนะนำสำหรับ ${n} คน`,
    pace: "ความเร็ว",
    paces: { quick: "เร็ว", standard: "ปกติ", relaxed: "ผ่อนคลาย" },
    deal: "แจกการ์ด",
    waitingDeal: (h) => `รอ ${h} แจกการ์ด`,
    fewer: (r) => `ลด ${r}`,
    more: (r) => `เพิ่ม ${r}`,

    phaseTitle: (phase, day, winner) =>
        ({
            lobby: "รวมตัวที่โรงเตี๊ยม",
            night: `คืนที่ ${day}`,
            witch: `คืนที่ ${day}`,
            day: `วันที่ ${day}`,
            vote: `วันที่ ${day} · โหวต`,
            hunter: "นัดสุดท้ายของนายพราน",
            over: winner === "wolves" ? "หมาป่าชนะ" : winner === "village" ? "หมู่บ้านชนะ" : "จบเกม",
        })[phase],
    phaseSub: (phase, seated, host) =>
        ({
            lobby: `นั่งแล้ว ${seated} คน · ${host} เป็นเจ้าภาพ`,
            night: "หมู่บ้านหลับใหล",
            witch: "หม้อยาเดือดปุดๆ",
            day: "ถกเถียงและกล่าวหา",
            vote: "เลือกคนที่ต้องจากไป",
            hunter: "ลูกธนูดอกสุดท้าย",
            over: "เปิดเผยทุกบทบาทแล้ว",
        })[phase],
    boardSub: (phase) =>
        ({
            lobby: "เปิดแผงมนุษย์หมาป่าเพื่อนั่งลง",
            night: "หมู่บ้านหลับใหล มีบางอย่างเคลื่อนไหว",
            witch: "หม้อยาเดือดอยู่ในความมืด",
            day: "คุยกันให้ดี ใครกำลังโกหก?",
            vote: "หมู่บ้านต้องตัดสินใจ",
            hunter: "ลูกธนูดอกสุดท้าย",
            over: "การ์ดทุกใบถูกเปิดแล้ว",
        })[phase],
    transition: (phase, day, winner, hasPower) => {
        switch (phase) {
            case "night":
                return { title: `คืนที่ ${day}`, sub: hasPower ? "พลังของคุณตื่นขึ้นแล้ว" : "หลับตาลง" };
            case "day":
                return { title: `วันที่ ${day}`, sub: "ดวงอาทิตย์ขึ้นเหนือหมู่บ้าน" };
            case "vote":
                return { title: "ถึงเวลาโหวต", sub: "ชี้ตัวคนร้าย" };
            case "hunter":
                return { title: "นายพรานล้มลง", sub: "เหลือลูกธนูอีกหนึ่งดอก" };
            case "over":
                return { title: th.overTitle(winner), sub: "การ์ดทุกใบถูกเปิดแล้ว" };
            default:
                return null;
        }
    },

    hostAway: (h) => `${h} ไม่อยู่ เกมจะดำเนินต่อเมื่อเจ้าภาพกลับมา`,
    watching: "คุณกำลังดูเกมนี้ นั่งลงได้เมื่อเริ่มรวมตัวรอบหน้า",
    prompt: {
        kill: ["เลือกเหยื่อของคุณ", "คืนนี้จะจบเร็วขึ้นเมื่อทั้งฝูงเลือกเหยื่อคนเดียวกัน"],
        inspect: ["ส่องลูกแก้ว", "เลือกผู้เล่นหนึ่งคน คุณจะรู้ว่าเขาเป็นมนุษย์หมาป่าหรือไม่"],
        protect: ["เฝ้าดูแลใครสักคน", "หมาป่าฆ่าคนที่คุณปกป้องคืนนี้ไม่ได้ คุณเลือกตัวเองได้"],
        protectRepeat: "คุณปกป้องคนเดิมสองคืนติดกันไม่ได้",
        witch: ["หม้อยาของคุณเดือดแล้ว", "ยาแต่ละขวดใช้ได้ครั้งเดียวต่อเกม เลือกแล้วจึงปรุง"],
        ready: ["คุยกันก่อน แล้วค่อยโหวต", "เมื่อทุกคนที่ยังมีชีวิตพร้อม การโหวตจะเริ่มขึ้น"],
        vote: ["ใครควรออกจากหมู่บ้าน?", "ผู้เล่นต้องได้คะแนนมากกว่าตัวเลือกอื่นทั้งหมด รวมถึงการงดออกเสียง ถ้าเสมอจะไม่มีใครถูกขับไล่"],
        shoot: ["ยิงนัดสุดท้าย", "คุณกำลังจะตาย เลือกคนที่ลูกธนูของคุณจะพาไปด้วย หรือจะไม่ยิงก็ได้"],
    },
    act: (kind, n) => ({ kill: `ขย้ำ ${n}`, inspect: `ส่องดู ${n}`, protect: `ปกป้อง ${n}`, vote: `โหวต ${n}`, shoot: `ยิง ${n}` })[kind],
    readyStatus: (r, a) => `พร้อมแล้ว · ${r} จาก ${a}`,
    readyButton: (r, a) => `ฉันพร้อมโหวต · ${r}/${a}`,
    waiting: "กำลังรอ…",
    sending: "กำลังส่ง…",
    heldFire: "คุณเลือกไม่ยิง",
    skipped: "คุณเลือกงดออกเสียง",
    tapToChange: "· แตะคนอื่นเพื่อเปลี่ยน",
    tapPlayer: "แตะผู้เล่นด้านล่าง",
    holdFire: "ไม่ยิง",
    skip: "งดออกเสียง",

    witch: {
        done: "คืนนี้คุณปรุงยาเสร็จแล้ว",
        victim: (n) => `คืนนี้หมาป่าโจมตี ${n}`,
        noVictim: "คืนนี้ไม่มีใครใกล้ตาย",
        saving: (n) => `กำลังช่วย ${n}`,
        heal: "ยาชุบชีวิต",
        healHint: "แตะเพื่อช่วยเหยื่อคืนนี้",
        healSpent: "ยาชุบชีวิตของคุณหมดแล้ว",
        poisoning: (n) => `กำลังวางยา ${n}`,
        poison: "ยาพิษ",
        poisonPick: "แตะผู้เล่นด้านล่างเพื่อวางยา",
        poisonCancel: "แตะคนเดิมอีกครั้งเพื่อยกเลิก",
        poisonSpent: "ยาพิษของคุณหมดแล้ว",
        brewing: "กำลังปรุง…",
        brew: "ปรุงยา",
        nothing: "คืนนี้ไม่ทำอะไร",
    },

    asleep: "คุณกำลังหลับ",
    sleepWolf: "ฝูงของคุณกำลังตัดสินใจ ใช้แชทฝูงเพื่อวางแผน",
    sleepWitch: "รอให้หมาป่าเลือกก่อน แล้วหม้อยาของคุณจะตื่น",
    sleepOther: "หลับตาลง แล้วฟังเสียงฝีเท้า",
    died: "คุณตายแล้ว",
    diedText: "วิญญาณพูดไม่ได้ แต่มองเห็นบทบาทของทุกคน ดูหมู่บ้านดิ้นรนต่อไป",
    visions: "นิมิตของคุณ",
    reading: (d, n, w) => `คืนที่ ${d}: ${n} ${w ? "เป็นมนุษย์หมาป่า" : "ไม่ใช่มนุษย์หมาป่า"}`,
    pipWolf: "หมาป่า",
    pipSafe: "ปลอดภัย",
    village: "หมู่บ้าน",
    aliveOf: (a, t) => `รอด ${a} จาก ${t}`,
    tagDead: "† ตายแล้ว",
    tagDeadRole: (r) => `† ${r}`,
    tagVotedSkip: "งดออกเสียง",
    tagReady: "พร้อม",
    tagSeerWolf: "หมาป่า!",
    tagSeerSafe: "ไม่ใช่หมาป่า",
    hosting: "คุณเป็นเจ้าภาพ",
    narrating: "คุณเป็นผู้ดำเนินเกม",
    skipTimer: "ข้ามเวลา",
    endGame: "จบเกม",
    tapAgain: "แตะอีกครั้งเพื่อจบ",

    overTitle: (w) => (w === "wolves" ? "หมาป่าได้กินเลี้ยง" : w === "village" ? "หมู่บ้านรอดแล้ว" : "จบเกม"),
    verdict: (w, mine) => (!w ? "เกมถูกจบก่อนเวลา" : !mine ? "" : mine === w ? "ฝ่ายของคุณชนะ" : "ฝ่ายของคุณแพ้"),
    everyCard: "เปิดการ์ดทุกใบ",
    diedSuffix: " · ตาย",
    playAgain: "เล่นอีกครั้ง",
    showTable: "ดูโต๊ะ",

    square: "ลานหมู่บ้าน",
    pack: "ฝูง",
    tabVillage: "หมู่บ้าน",
    tabChat: "แชท",
    emptyNoGame: "เริ่มเกมเพื่อเปิดลานหมู่บ้าน",
    emptyPack: "มีแต่ฝูงเท่านั้นที่อ่านได้ กระซิบแผนของคุณ",
    emptyTown: "ยังไม่มีใครพูด",
    packOnlyNight: "ฝูงคุยกันได้เฉพาะตอนกลางคืน",
    townClosed: {
        join: "นั่งลงที่โต๊ะเพื่อแชท",
        watching: "คุณกำลังดูเกมนี้ เข้าร่วมรอบหน้าเพื่อพูดคุย",
        dead: "คนตายพูดไม่ได้ ดูไปและรอจนจบเกม",
        night: "หมู่บ้านหลับใหล ลานจะเปิดอีกครั้งตอนรุ่งสาง",
    },
    placeholderTown: "พูดกับหมู่บ้าน…",
    placeholderPack: "กระซิบกับฝูง…",
    charsLeft: (n) => `เหลือ ${n} ตัวอักษร`,
    send: "ส่ง",
    message: "ข้อความ",

    teamPack: "ฝูงมนุษย์หมาป่า",
    teamVillage: "ฝ่ายหมู่บ้าน",
    yourPack: (n) => `ฝูงของคุณ: ${n}`,
    gotIt: "เข้าใจแล้ว",
    yourRole: (r) => `บทบาทของคุณ: ${r}`,

    seatedN: (n) => `นั่งแล้ว ${n} คน`,
    cardsInDeck: (n) => `การ์ด ${n} ใบในสำรับ`,
    hostedBy: (n) => `${n} เป็นเจ้าภาพ`,
    noSeatsYet: "ยังไม่มีใครนั่ง",
    votes: (n) => `${n} เสียง`,
    readyToVote: "พร้อมโหวต",
    aiming: "กำลังเล็ง…",
    squareTitle: "ลานหมู่บ้าน",
    nothingSaid: "ยังไม่มีใครพูด",

    notice: (n) => {
        switch (n.code) {
            case "game-running":
                return "มีเกมที่กำลังเล่นอยู่บนบอร์ดนี้แล้ว";
            case "table-full":
                return "โต๊ะเต็มแล้ว";
            case "cannot-speak":
                return "ตอนนี้คุณพูดไม่ได้";
            case "need-collab":
                return "อนุญาตการเข้าถึงข้อมูลผู้ร่วมงาน เพื่อให้ผู้เล่นคนอื่นเห็นว่าคุณคือใคร";
            case "need-access":
                return "มนุษย์หมาป่าต้องเข้าถึงบอร์ดเพื่อเล่น เปิดแผงอีกครั้งเพื่ออนุญาต";
            case "secrets-elsewhere":
                return "ความลับของเกมนี้ถูกผนึกไว้บนอุปกรณ์อื่น กลับไปที่อุปกรณ์นั้นเพื่อเป็นเจ้าภาพต่อ";
            case "failed":
                return `เกิดข้อผิดพลาด: ${n.detail}`;
            case "deck":
                return th.problem(n.problem);
        }
    },
    problem: (p) => {
        switch (p.code) {
            case "min":
                return `ต้องมีผู้เล่นอย่างน้อย ${p.n} คน`;
            case "max":
                return `ผู้เล่นได้สูงสุด ${p.n} คน`;
            case "size":
                return `สำรับมีการ์ด ${p.cards} ใบ แต่มีผู้เล่น ${p.players} คน`;
            case "no-wolf":
                return "สำรับต้องมีมนุษย์หมาป่าอย่างน้อยหนึ่งใบ";
            case "too-many-wolves":
                return "หมาป่ามากเกินไป พวกมันจะชนะทันที";
            case "one-special":
                return `มี${thRoles[p.role].name}ได้แค่หนึ่งคนต่อเกม`;
        }
    },
    event: (e, name) => {
        switch (e.kind) {
            case "phase":
                return {
                    "first-night": "ราตรีมาเยือนหมู่บ้าน ทุกคนหลับตาลง",
                    night: "ราตรีมาเยือนอีกครั้ง หลับตาลง",
                    dawn: `รุ่งสางของวันที่ ${e.day}`,
                    vote: "หมู่บ้านรวมตัวกันเพื่อโหวต",
                }[e.what];
            case "saved":
                return e.survived ? "หมาป่าลงมือแล้ว แต่เหยื่อรอดชีวิตผ่านคืนนั้นมาได้" : "เมื่อคืนไม่มีใครตาย";
            case "death": {
                const n = name(e.who);
                const r = thRoles[e.role].name;
                const text: Record<DeathCause, string> = {
                    wolves: `พบ ${n} ถูกฉีกร่างเมื่อรุ่งสาง เขาคือ${r}`,
                    poison: `พบ ${n} นอนแน่นิ่งเย็นเฉียบ มีคราบสีเขียวแปลกๆ ที่ริมฝีปาก เขาคือ${r}`,
                    vote: `${n} ถูกพาตัวออกจากหมู่บ้าน เขาคือ${r}`,
                    hunter: `ลูกธนูของนายพรานพุ่งเข้าใส่ ${n} เขาคือ${r}`,
                };
                return text[e.cause];
            }
            case "vote":
                if (e.outcome === "exiled") return `หมู่บ้านขับไล่ ${name(e.who)} ด้วยคะแนน ${e.votes} เสียง`;
                return e.outcome === "split" ? "คะแนนเสียงแตก วันนี้ไม่มีใครถูกขับไล่" : "ไม่มีใครโหวต วันนี้ไม่มีใครถูกขับไล่";
            case "hunter":
                return `${name(e.who)} คือนายพราน และยกหน้าไม้ขึ้นด้วยลมหายใจสุดท้าย`;
            case "hold-fire":
                return `${name(e.who)} ลดหน้าไม้ลง ไม่มีการยิง`;
            case "ended":
                return "เจ้าภาพจบเกมแล้ว";
            case "win":
                return e.team === "village" ? "หมาป่าตัวสุดท้ายหมดไปแล้ว หมู่บ้านชนะ!" : "หมาป่ามีจำนวนมากกว่าชาวบ้าน หมาป่าชนะ!";
        }
    },
};

// ---------------------------------------------------------------------------
// Simplified Chinese

const zhRoles: Record<RoleId, RoleText> = {
    werewolf: { name: "狼人", blurb: "夜里狩猎，白天伪装。", power: "与狼队友商定今晚要袭击的村民。" },
    villager: { name: "村民", blurb: "没有技能，只有智慧。找出狼人。", power: null },
    seer: { name: "预言家", blurb: "每晚查验一名玩家是否为狼人。", power: "选择一名玩家，查验其真实身份。" },
    doctor: { name: "医生", blurb: "每晚保护一名玩家免遭狼人袭击。", power: "选择要保护的人。不能连续两晚保护同一人。" },
    hunter: { name: "猎人", blurb: "倒下时，可以带走一名玩家。", power: null },
    witch: { name: "女巫", blurb: "一瓶解药救人，一瓶毒药杀人。", power: "救活狼人的目标，或毒杀任意一人。每种药全局只能用一次。" },
};

const zh: Strings = {
    appName: "狼人杀",
    tagline: "月光下的谎言游戏",
    menuTitle: "玩狼人杀",
    heroText: "狼人藏身于村民之中。每到夜晚，它们出来狩猎；每到白天，全村投票找出它们。发言、推理，然后把谎撒圆。",
    language: "语言",
    narrateTitle: "担任法官，不参与游戏",
    narrateDetail: "由你主持牌局，并能看到所有身份。",
    gather: "召集村民",
    howToPlay: "游戏规则",
    rules: [
        "每人获得一张秘密身份牌。狼人彼此认识，其他人一无所知。",
        "夜晚，狼人选择袭击目标。预言家查验一人，医生保护一人，女巫可以救人或下毒。",
        "天亮后公布死者。村民在广场讨论，然后投票放逐一人。",
        "死者不能发言。猎人死亡时，可以开枪带走一名玩家。",
        "狼人全部出局时村民获胜；狼人数量与村民相等时狼人获胜。",
    ],
    loading: "正在点亮灯笼…",

    roles: zhRoles,
    roleCount: (r, n) => (n > 1 ? `${zhRoles[r].name} ×${n}` : zhRoles[r].name),
    teams: { village: "好人阵营", wolves: "狼人阵营" },

    you: (n) => `${n}（你）`,
    narrator: (n) => `${n}（法官）`,
    someone: "某人",
    aWolf: "一只狼",
    nobody: "无人",
    away: "离开",

    atTable: "入座玩家",
    noSeats: "还没有人入座。",
    leave: "离开座位",
    takeSeat: "入座",
    deck: "牌组",
    deckCount: (c, p) => `${c} 张牌 · ${p} 名玩家`,
    suggested: (n) => `使用 ${n} 人推荐牌组`,
    pace: "节奏",
    paces: { quick: "快速", standard: "标准", relaxed: "从容" },
    deal: "发牌",
    waitingDeal: (h) => `等待 ${h} 发牌。`,
    fewer: (r) => `减少${r}`,
    more: (r) => `增加${r}`,

    phaseTitle: (phase, day, winner) =>
        ({
            lobby: "旅店集合",
            night: `第 ${day} 夜`,
            witch: `第 ${day} 夜`,
            day: `第 ${day} 天`,
            vote: `第 ${day} 天 · 投票`,
            hunter: "猎人的最后一枪",
            over: winner === "wolves" ? "狼人获胜" : winner === "village" ? "村民获胜" : "游戏结束",
        })[phase],
    phaseSub: (phase, seated, host) =>
        ({
            lobby: `已入座 ${seated} 人 · 房主 ${host}`,
            night: "村庄沉睡",
            witch: "坩埚冒着泡",
            day: "讨论与指控",
            vote: "选出离开的人",
            hunter: "最后一箭",
            over: "所有身份已公开",
        })[phase],
    boardSub: (phase) =>
        ({
            lobby: "打开狼人杀面板即可入座",
            night: "村庄沉睡，有什么在暗中蠢动。",
            witch: "黑暗中，坩埚咕嘟作响。",
            day: "好好聊聊，谁在说谎？",
            vote: "村庄必须做出选择。",
            hunter: "最后一箭。",
            over: "所有底牌已翻开。",
        })[phase],
    transition: (phase, day, winner, hasPower) => {
        switch (phase) {
            case "night":
                return { title: `第 ${day} 夜`, sub: hasPower ? "你的能力苏醒了。" : "请闭眼。" };
            case "day":
                return { title: `第 ${day} 天`, sub: "太阳照常升起。" };
            case "vote":
                return { title: "投票", sub: "指出你怀疑的人。" };
            case "hunter":
                return { title: "猎人倒下", sub: "还剩最后一箭。" };
            case "over":
                return { title: zh.overTitle(winner), sub: "所有底牌已翻开。" };
            default:
                return null;
        }
    },

    hostAway: (h) => `${h} 暂时离开，房主回来后游戏继续。`,
    watching: "你正在观战。下一局集合时再入座吧。",
    prompt: {
        kill: ["选择你的猎物", "全体狼人指向同一目标时，夜晚会提前结束。"],
        inspect: ["凝视水晶球", "选择一名玩家，你将得知其是否为狼人。"],
        protect: ["守护一人", "今晚你保护的人不会被狼人杀死。可以保护自己。"],
        protectRepeat: "不能连续两晚保护同一个人。",
        witch: ["你的坩埚沸腾了", "每种药全局只能用一次。选好后开始调配。"],
        ready: ["先讨论，再投票", "所有存活玩家准备好后开始投票。"],
        vote: ["谁该离开村庄？", "得票必须多于其他任何选项（包括弃票）才会被放逐。平票则无人出局。"],
        shoot: ["开出最后一枪", "你即将死去。选择要带走的人，或者放下武器。"],
    },
    act: (kind, n) => ({ kill: `袭击 ${n}`, inspect: `查验 ${n}`, protect: `保护 ${n}`, vote: `投给 ${n}`, shoot: `射击 ${n}` })[kind],
    readyStatus: (r, a) => `已准备 · ${r}/${a}`,
    readyButton: (r, a) => `我准备好投票了 · ${r}/${a}`,
    waiting: "等待中…",
    sending: "发送中…",
    heldFire: "你放下了武器。",
    skipped: "你选择了弃票。",
    tapToChange: "· 点选他人可更改",
    tapPlayer: "请点选下方玩家。",
    holdFire: "不开枪",
    skip: "弃票",

    witch: {
        done: "今晚的药已调配完毕。",
        victim: (n) => `今晚狼人袭击了 ${n}。`,
        noVictim: "今晚无人垂死。",
        saving: (n) => `救活 ${n}`,
        heal: "解药",
        healHint: "点击救活今晚的受害者。",
        healSpent: "你的解药已用完。",
        poisoning: (n) => `毒杀 ${n}`,
        poison: "毒药",
        poisonPick: "点选下方玩家下毒。",
        poisonCancel: "再次点选该玩家可取消。",
        poisonSpent: "你的毒药已用完。",
        brewing: "调配中…",
        brew: "调配",
        nothing: "今晚什么都不做",
    },

    asleep: "你正在沉睡",
    sleepWolf: "你的狼队友正在商量，可以在狼人频道密谋。",
    sleepWitch: "等狼人做出选择后，你的坩埚才会苏醒。",
    sleepOther: "闭上眼睛，倾听脚步声。",
    died: "你已死亡",
    diedText: "亡魂不能说话，但能看到所有身份。看着村民们挣扎吧。",
    visions: "你的预言",
    reading: (d, n, w) => `第 ${d} 夜：${n} ${w ? "是狼人。" : "不是狼人。"}`,
    pipWolf: "狼人",
    pipSafe: "好人",
    village: "村庄",
    aliveOf: (a, t) => `存活 ${a}/${t}`,
    tagDead: "† 死亡",
    tagDeadRole: (r) => `† ${r}`,
    tagVotedSkip: "弃票",
    tagReady: "已准备",
    tagSeerWolf: "狼人！",
    tagSeerSafe: "好人",
    hosting: "你是房主",
    narrating: "你是法官",
    skipTimer: "跳过计时",
    endGame: "结束游戏",
    tapAgain: "再点一次结束",

    overTitle: (w) => (w === "wolves" ? "狼人饱餐一顿" : w === "village" ? "村庄幸存" : "游戏结束"),
    verdict: (w, mine) => (!w ? "游戏被提前结束。" : !mine ? "" : mine === w ? "你的阵营获胜。" : "你的阵营落败。"),
    everyCard: "所有底牌",
    diedSuffix: " · 死亡",
    playAgain: "再来一局",
    showTable: "查看牌桌",

    square: "村庄广场",
    pack: "狼人频道",
    tabVillage: "村庄",
    tabChat: "聊天",
    emptyNoGame: "开始游戏后即可进入村庄广场。",
    emptyPack: "只有狼人能看到这里。悄悄商量计划吧。",
    emptyTown: "还没有人发言。",
    packOnlyNight: "狼人只能在夜晚交流。",
    townClosed: {
        join: "入座后才能聊天。",
        watching: "你正在观战。加入下一局即可发言。",
        dead: "死者不能发言。静静观看，等待终局。",
        night: "村庄沉睡中。广场将在天亮后重新开放。",
    },
    placeholderTown: "对全村发言…",
    placeholderPack: "对狼队友低语…",
    charsLeft: (n) => `还剩 ${n} 字`,
    send: "发送",
    message: "消息",

    teamPack: "狼人阵营",
    teamVillage: "好人阵营",
    yourPack: (n) => `你的狼队友：${n}`,
    gotIt: "知道了",
    yourRole: (r) => `你的身份：${r}`,

    seatedN: (n) => `已入座 ${n} 人`,
    cardsInDeck: (n) => `牌组共 ${n} 张`,
    hostedBy: (n) => `房主 ${n}`,
    noSeatsYet: "还没有人入座。",
    votes: (n) => `${n} 票`,
    readyToVote: "准备投票",
    aiming: "瞄准中…",
    squareTitle: "村庄广场",
    nothingSaid: "还没有人发言。",

    notice: (n) => {
        switch (n.code) {
            case "game-running":
                return "此白板上已有一局正在进行。";
            case "table-full":
                return "座位已满。";
            case "cannot-speak":
                return "你现在不能发言。";
            case "need-collab":
                return "请允许协作权限，让其他玩家知道你是谁。";
            case "need-access":
                return "狼人杀需要访问白板才能进行。请重新打开面板并授权。";
            case "secrets-elsewhere":
                return "本局的机密封存在另一台设备上。请回到该设备继续主持。";
            case "failed":
                return `出错了：${n.detail}`;
            case "deck":
                return zh.problem(n.problem);
        }
    },
    problem: (p) => {
        switch (p.code) {
            case "min":
                return `至少需要 ${p.n} 名玩家。`;
            case "max":
                return `最多 ${p.n} 名玩家。`;
            case "size":
                return `牌组有 ${p.cards} 张牌，但有 ${p.players} 名玩家。`;
            case "no-wolf":
                return "牌组中至少需要一名狼人。";
            case "too-many-wolves":
                return "狼人太多，开局即获胜。";
            case "one-special":
                return `每局只能有一名${zhRoles[p.role].name}。`;
        }
    },
    event: (e, name) => {
        switch (e.kind) {
            case "phase":
                return {
                    "first-night": "夜幕降临村庄。所有人，请闭眼。",
                    night: "夜幕再次降临。请闭眼。",
                    dawn: `第 ${e.day} 天，天亮了。`,
                    vote: "村民们聚集起来投票。",
                }[e.what];
            case "saved":
                return e.survived ? "狼人出手了，但受害者熬过了这一夜。" : "昨晚是平安夜，无人死亡。";
            case "death": {
                const n = name(e.who);
                const r = zhRoles[e.role].name;
                const text: Record<DeathCause, string> = {
                    wolves: `天亮时，${n} 被发现惨遭撕裂。其身份是${r}。`,
                    poison: `${n} 被发现时已冰冷僵硬，唇边有一抹诡异的绿色。其身份是${r}。`,
                    vote: `${n} 被带离了村庄。其身份是${r}。`,
                    hunter: `猎人的箭射中了 ${n}。其身份是${r}。`,
                };
                return text[e.cause];
            }
            case "vote":
                if (e.outcome === "exiled") return `村民以 ${e.votes} 票放逐了 ${name(e.who)}。`;
                return e.outcome === "split" ? "票数分散，今天无人被放逐。" : "无人投票，今天无人被放逐。";
            case "hunter":
                return `${name(e.who)} 是猎人，用最后一口气举起了弩。`;
            case "hold-fire":
                return `${name(e.who)} 放下了弩，没有开枪。`;
            case "ended":
                return "房主结束了游戏。";
            case "win":
                return e.team === "village" ? "最后一只狼人已出局。村民获胜！" : "狼人数量已压过村民。狼人获胜！";
        }
    },
};

export const STRINGS: Record<Lang, Strings> = { en, th, zh };

export function t(lang: Lang): Strings {
    return STRINGS[lang] ?? en;
}
