# Werewolf for Drawdy: technical notes

For players, see the [README](README.md).

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
