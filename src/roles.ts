export type RoleId =
    | "villager"
    | "werewolf"
    | "seer"
    | "doctor"
    | "hunter"
    | "witch";

export type Team = "village" | "wolves";

/** Wording lives in i18n.ts; this is only what the rules need. */
export type RoleInfo = {
    team: Team;
    /** Acts at night. */
    night: boolean;
};

export const ROLES: Record<RoleId, RoleInfo> = {
    werewolf: { team: "wolves", night: true },
    villager: { team: "village", night: false },
    seer: { team: "village", night: true },
    doctor: { team: "village", night: true },
    hunter: { team: "village", night: false },
    witch: { team: "village", night: true },
};

export const ROLE_ORDER: RoleId[] = [
    "werewolf",
    "seer",
    "doctor",
    "witch",
    "hunter",
    "villager",
];

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;

export type RoleCounts = Record<RoleId, number>;

/** A balanced default deck for `n` players. */
export function suggestedRoles(n: number): RoleCounts {
    const werewolf = n <= 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4;
    const seer = 1;
    const doctor = n >= 5 ? 1 : 0;
    const hunter = n >= 7 ? 1 : 0;
    const witch = n >= 9 ? 1 : 0;
    const villager = Math.max(0, n - werewolf - seer - doctor - hunter - witch);
    return { werewolf, seer, doctor, hunter, witch, villager };
}
