# Post Caption.Ninja captions to your stream chat

Speak into Caption.Ninja as usual. Social Stream Ninja (SSN) can send each finished sentence to the chats you choose.

## 1. 🔗 Link Caption.Ninja

Switch SSN on. In **Search settings**, type **Caption.Ninja linked**. Select the result, then click **Open Caption.Ninja linked to SSN**. Allow microphone access on the page that opens.

![SSN settings search showing the Open Caption.Ninja linked to SSN result.](images/social-stream/find-link.png)

## 2. 🎙️ Check your first caption

Say a short sentence, then pause. Your words should appear in Caption.Ninja and in the SSN dock. To show live captions on stream, use the **overlay link** from the Caption.Ninja page in OBS. Keep the microphone page address private.

![Caption.Ninja sends live captions to the OBS overlay and finished captions to the SSN dock. Posting to chat is optional.](images/social-stream/caption-path.svg)

## 3. 💬 Choose your chats

Back in the same SSN settings, turn on **Post my captions to chat**. Choose a connected chat from **Select source** and click **Add**. Say another sentence and look for it in that chat.

![Post my captions to chat switched on. Selected chats appear above the Select source menu and Add button.](images/social-stream/chat-settings.png)

## Other setups

<details>
<summary>Keep a custom Caption.Ninja link you already use</summary>

1. Select **Copy ID** on SSN's **Chat** tab.
2. Add `&ssn=YOUR_SSN_SESSION_ID` to your existing microphone page address. Replace the placeholder with the ID you copied. If your SSN session has a password, also add `&ssnpassword=YOUR_PASSWORD`.
3. Press Enter and continue from **Check your first caption** above.

</details>

<details>
<summary>Display a room in SSN without posting to chat</summary>

Turn on **Show Caption.Ninja captions as messages** and paste the overlay link into **Caption.Ninja room**. When it says **Connected**, the room's captions appear in the dock and overlays. This option works with public relay rooms.

</details>
