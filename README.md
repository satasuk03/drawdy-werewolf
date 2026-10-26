# Werewolf for Drawdy

Play Werewolf with everyone on your board. Each player gets a secret role card. The wolves hunt at night, the village argues and votes by day, and the dead stay silent.

Install the extension, click the wolf icon in the toolbar, and press **Gather the village**. Everyone else on the board clicks the same icon and takes a seat.

![The vote, on a desktop panel](assets/vote-wide.png)

## How to use

1. **Gather.** One person opens the panel and presses **Gather the village**. A table appears on the board. That person is the host, and their browser runs the game, so they should keep the board open until the game ends.
2. **Take a seat.** Everyone else opens the panel and presses **Take a seat**. The host picks the deck (it follows the player count until edited), the pace, and whether they play or only narrate. Then the host presses **Deal the cards**.
3. **Night.** Your role card flips over. Wolves choose a victim together and can whisper in the Pack chat. The Seer reads one player, the Doctor shields one, and then the Witch may heal the victim or poison someone.
4. **Day.** The dead are revealed at dawn. Talk in the Village Square. When everyone is ready, or time runs out, the vote opens. A player is exiled only with more votes than any other choice, skip included.
5. **The end.** The village wins when every wolf is gone. The wolves win when they equal the villagers. Every card is turned over.

| Role | Team | Power |
| ---- | ---- | ----- |
| Werewolf | Wolves | Each night, agree with the pack on a victim. |
| Villager | Village | None. Find the wolves. |
| Seer | Village | Each night, learn whether one player is a werewolf. |
| Doctor | Village | Each night, protect one player. Not the same player twice in a row. |
| Witch | Village | One healing potion and one poison, each usable once per game. |
| Hunter | Village | When they die, they shoot one player. |

| Interaction | What happens |
| ----------- | ------------ |
| Tap a player, then confirm | Submits your night action or vote. Wolves, the Doctor, and voters can change their choice until the phase ends. |
| Village Square | Open to living players by day and in the lobby. It is closed at night and to the dead. |
| Pack chat | Only wolves can read it, and only at night. |
| Skip timer / End game | Host only. |
| Dying | You see every role, but you can no longer talk. |

<p>
<img src="assets/night-wolf-phone.png" width="260" alt="A wolf choosing prey on a phone">
<img src="assets/witch-phone.png" width="260" alt="The witch's potions">
<img src="assets/dead-chat-phone.png" width="260" alt="A dead player's closed chat">
</p>

## Languages

The game speaks English, Thai (ไทย), and Simplified Chinese (中文). Each player picks their own language from the globe button in the panel header. The first time, it follows the browser's language, and the choice is remembered on that device. Events such as deaths and votes are stored as data and worded in each player's language, so a Thai player and an English player at the same table each read the story in their own language. The shared table on the board, including the card banners, uses the host's language. Chat messages appear exactly as players typed them.

<p>
<img src="assets/witch-phone-th.png" width="260" alt="The witch's turn in Thai">
<img src="assets/vote-wide-zh.png" width="520" alt="The vote in Chinese">
</p>

## How it works

Drivers on different machines can only talk through the board, so every piece of game data is a small invisible element inside the Werewolf frame. The host's driver runs the rules. Players' drivers write their seat, actions, and messages.

- **Secrets stay secret.** Roles, night actions, and the wolves' chat are encrypted with keys shared only between each player and the host (X25519 and ChaCha20-Poly1305, implemented in `src/primitives.ts` because Drawdy's driver worker has no Web Crypto). Every sealed box is padded to a fixed size, and actions and pack messages carry no names, so element data doesn't reveal who acts at night or who the wolves are.
- **The dead cannot speak.** The panel closes the chat for dead players. The host also accepts a message only if its sender was allowed to speak when it was sent, and every client shows only accepted messages. Each message carries a code only its author and the host can produce, and each player's keys are pinned when they sit down. A modified driver can't speak for the dead or post under someone else's name.
- **The host sees all.** The host's browser knows every role, because it runs the game, and it stamps every game state with a per-player code so nobody else can rewrite it. Choose a host everyone trusts, or let the host narrate instead of playing.
- **Reloading.** Reopen the panel after a reload to rejoin. Your keys are kept in the extension's storage on that device.

The board shows a shared table with each player's card (face down until they die), and the Village Square log.

![The table on the board](assets/board.png)

## Permissions

| Permission | Why |
| ---------- | --- |
| `dom` | The toolbar button, the context menu entry, and the game panel. |
| `scene` | The table and the game's hidden records on the board. |
| `storage` | Your encryption keys on this device, so a reload can rejoin the game. |
| `collaboration` | Players' names and colors, and who is online. |

## Development

```bash
npm install
npm run dev        # dev server for Drawdy's "Add extension dev server"
npm test           # rule tests plus full games across simulated players
npm run build      # rebuilds src/webview-html.ts, then dist/satasuk-werewolf.drawdyx
```

The panel lives in `webview/` and is inlined into `src/webview-html.ts` by `npm run build:webview`. Commit the generated file, because Drawdy builds only `src/`. `node scripts/screens.mjs <dir>` plays a scripted game and screenshots every screen at phone and desktop sizes.

## Credits

Card art is original SVG, drawn for this extension.
