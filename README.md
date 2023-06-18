# CAPTION.Ninja

This is a free-to-use captioning tool.

Demo video here: https://www.youtube.com/watch?v=v7172QO8z6c

![image](https://user-images.githubusercontent.com/2575698/169529892-8764c5df-354c-4fad-85e5-c8ecfec4cc95.png)

### How to use

To use this app, accept the microphone permissions on page load and then just say something outloud.

The output of this app is mirrored here: https://caption.ninja/overlay?room={someromoname}.

Please note that this app uses your default microphone as the audio input source. You can't change the default audio source from within the app, but you can change it at your system level by changing the default recording device. You can also change audio sources by using a virtual audio cable, such as this one. Using it, it becomes possible to select other sources, including microphones, speakers, and other applications.

Using Google Chrome is strongly recommended for best results.

The text-to-speech service will only work for one session per browser. If you try to load multiple text-to-speech tabs at a time, they will all stop working for a period of time. You can have as many overlay/viewer pages loaded as you want however.

If you wish to save the transcriptions, just select-all when done (ctrl+a), copy the selected text(ctrl+c), pasting it into text editor (ctrl+v).  A download button might also appear on the page, which may download the transcription as a srt caption file as well.

### Studio integration

Add it to OBS, VMix or other studio software as a browser source overlay if wishing to use it for a live stream. It also works with the Electron Capture app, which can allow you to pin the app on-top of other apps on your desktop with ease. https://github.com/steveseguin/electroncapture

### Changing the font-size and more
If wishing to change the CSS, you can self-host JUST the overlay.html file, modify it, and load that into your browser. You can still use the main website for capture, and just have different variations of the overlay.html file locally.  

If using OBS, you can also just load output into that, and change the CSS style via the browser-source style-sheet section.   You can just change the following, to be whatever you want, and use that as the CSS in OBS browser source.

```
.output {
    margin: 0;
    background-color: #0000;
    color: white;
    font-family: Cousine, monospace;
    font-size: 3.2em;
    line-height: 1.1em;
    letter-spacing: 0.0em;
    padding: 0em;
    text-shadow: 0.05em 0.05em 0px rgb(0 0 0);
}
```
#### Custom non-standard fonts

If the font you wish to use is not a standard web/system font, you can still use custom fonts without needing to edit code by loading the font via Base64.

You can use this tool (https://hellogreg.github.io/woff2base/) or this tool (https://transfonter.org/) to generate the base64 font from fonts such as: https://www.dafont.com/de/atari-st-8x16-system-font.font

To then load the font, we can apply it to our OBS browser source settings as a custom CSS entry, like so:

```
body { 
  background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; 
}
.output{
 font-family: "Atari ST 8x16 System Font", Cousine, monospace;
}
@font-face { 
  font-family: "Atari ST 8x16 System Font";
  font-weight: 100 900;
  font-style: normal italic;
  src: url(data:application/octet-stream;base64,AAEAAAAOAIAAAwBgRkZUTWXP4NIAAIdkAAAAHEdERUYADwAeAACHRAAAAB5PUy8yY0WLpAAAAWgAAABgY21hcJmJPykAAAPUAAAD7mN2dCAANQP1AAAHxAAAAARnYXNw//8AAwAAhzwAAAAIZ2x5Zpiad3sAAAnMAAB1NGhlYWT70........AAAwBgRkZUTWIKM=);
}
````
The base64 string will be quite long; this is normal.

![image](https://user-images.githubusercontent.com/2575698/148278546-2b0e25b8-cb31-45fa-b043-937d108db76e.png)


### Language codes
Language codes options available; default is `&lang=en-US`.  Just change the en-ES to a language code of your choosing.  A list of codes is here: https://cloud.google.com/speech-to-text/docs/languages

### Translation from Language A to Language B in real-time

There is an option for converting from the input langauge to another language, but it is experimental. While it works, it's a bit slow, prone to errors, and it may get even slower over time. Pull-requests that might improvement it are welcomed.

To access the translation-enabled version, see this file: https://caption.ninja/translate. At the top bar (the google translate bar), select the language you wish to translate to. The overlay page remains unchanged.  Text once translated will be deleted from the page, but it will be sent to the overlay page as normal.

### Manual text entry
Manual text entry mode is also supported via https://caption.ninja/manual.html

You can enter with your keybaord text overlays, instead of using automatic transcription.  Uses the same overlay output page, and both automatic and automatic can be used together if needed; funneling to the same overlay page even.

### Adding labels

Add &label=xxx to the capture page to give the outbound messages a label. (index.html?label=steve) This label will appear on the overlay page.

By default, labels will be input-santized, so special characters will be converted to just text, but you can accept HTML/CSS within the label if you add &html to the overlay page.  This decreases the security of the overlay page, but increases its stylistic flexiblity.

For example, this will make the display name bold on the output.
```
https://caption.ninja/?room=abc123&label=<b>steve</b>
https://caption.ninja/overlay?room=abc123&html
```
![image](https://user-images.githubusercontent.com/2575698/168219952-827734a2-75bd-45bc-9d8d-f0d7a98fe96c.png)

### Other random commands

`&showtime=5000" , to specify how long messages stay visible on the overlay.html page.  Time in milliseconds, and setting it to 0 will disable the auto-hiding of messages entirely.

### Self-hosting

Self-hosting is possible to do for free. You can fork this Github repository, use Github pages to host the website for free, and then modify the website code as needed. This is useful for custom styling the site, creating a custom domain name, or specifying a private websocket forwarding service to use.  This app is compatible with generic websocket forwarding services.

You can deploy your own basic websocket server with this code: https://github.com/steveseguin/websocket_server/  Hosting this server code on Amazon AWS or Google Cloud can be done for free as a micro server instance in most cases; pretty straight forward for someone technical. The websocket code is used for forwarding the messages from capture page to overlay display page; self-hosting the server code can provide a sense of added privacy.

The actual voice to text transcriptions are done usually on Google cloud servers, so it's not possible in most cases to fully-self host the service, although some devices, like Pixel smartphones, may do on-device voice to text rather than using the Google cloud.

### Disclaimers
I am not responsible if this app fails to work or whatever else. It is provided as-is without warranty or support. I do not take responsibility for any liability.
