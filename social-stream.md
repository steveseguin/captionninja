# Use Caption.Ninja with Social Stream Ninja

[Social Stream Ninja](https://socialstream.ninja) (SSN) can show each finished caption as a message in its dock and chat overlays, next to your Twitch, YouTube, Kick and other chats. It can also post what you say into those chats, so it stays readable after the caption leaves the screen.

There are two ways to connect them. Your captions, overlays and settings in Caption.Ninja work the same either way.

| | SSN reads your room | Caption.Ninja linked to SSN |
|---|---|---|
| Shows captions in the SSN dock | Yes | Yes |
| Can post captions to your chats | No | Yes |
| What you change in Caption.Ninja | Nothing | Add `&ssn=` to your capture page address |

## SSN reads your room

1. Open [caption.ninja](https://caption.ninja) and allow the microphone. Your room is in the address bar, after `room=`.
2. In the SSN popup, open **Settings → Mechanics - Connections & Integrations**.
3. Turn on **Show Caption.Ninja captions as messages**.
4. Paste your room, or the whole Caption.Ninja link, into **Caption.Ninja room**. The status beside the field changes to **Connected**.
5. Speak. Each finished caption appears in the SSN dock.

SSN does not post these captions into your chats. Anyone who has your room name can add captions to the room, so SSN shows them but does not send them out under your account.

## Link Caption.Ninja to SSN

Linking sends your finished captions to SSN over a private connection as well as to your room. SSN then knows they are yours and can post them to the chats you pick.

1. In the SSN popup, open **Settings → Mechanics - Connections & Integrations** and select **Open Caption.Ninja linked to SSN**.
   Or add `&ssn=YOUR_SSN_SESSION_ID` to the capture page address you already use, for example `https://caption.ninja/?room=abc123&lang=en-US&ssn=YOUR_SSN_SESSION_ID`.
2. Allow the microphone. A line on the page reads **Social Stream Ninja: linked** once it is connected. SSN must be open and switched on.
3. To post to chat, turn on **Post my captions to chat** in SSN and pick the chats.

- **Keep the linked capture page address to yourself.** It contains your SSN session.
- The overlay link shown on the capture page contains only your room. It is safe to share, as before.
- If your SSN session has a password, also add `&ssnpassword=YOUR_PASSWORD`. The link in the SSN popup does this for you.
- If SSN is also set to read the same room, each of your captions is still shown once. Captions from other speakers in the room are shown as before.

## Notes

- To show your name instead of "Captions", add `&label=YourName` to the address of the capture page.
- SSN uses finished captions only, not the word-by-word text. Keep the Caption.Ninja overlay in OBS for live on-screen captions.
- SSN receives the language you spoke. Translations are made inside the Caption.Ninja overlay and are not sent to SSN.
- Rooms on a private relay are not supported by "SSN reads your room".
- The link is available on the main capture page (`index.html`).

More options are in the [SSN captions guide](https://socialstream.ninja/beta/docs/index.html?file=captions.md).
