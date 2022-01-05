# CAPTION.Ninja

This is a free-to-use captioning tool.

Demo video here: https://www.youtube.com/watch?v=v7172QO8z6c

### How to use

To use this app, accept the microphone permissions on page load and then just say something outloud.

The output of this app is mirrored here: https://caption.ninja/overlay?room={someromoname}.

Please note that this app uses your default microphone as the audio input source. You can't change the default audio source from within the app, but you can change it at your system level by changing the default recording device. You can also change audio sources by using a virtual audio cable, such as this one. Using it, it becomes possible to select other sources, including microphones, speakers, and other applications.

Using Google Chrome is strongly recommended for best results.

If you wish to save the transcriptions, just select-all when done (ctrl+a), copy the selected text(ctrl+c), pasting it into text editor (ctrl+v).

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

### Self-hosting
You can sign up at https://www.piesocket.com/ for a free account if you wish to use your own API server for transferring data. You can use the API key given to specify that via the URL in Caption.Ninja, such as:

```https://caption.ninja/?room=XLk5tqU&pie=ZCu96UFf9ezeQeClK7BOCkq6Q0x0lxWAPJcgxjz5```

You can also deploy your own basic websocket server with this code: https://github.com/steveseguin/websocket_server/

### Disclaimers
I am not responsible if this app fails to work or whatever else. It is provided as-is without warranty or support. I do not take responsibility for any liability.
