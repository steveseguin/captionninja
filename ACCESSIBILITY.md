# Accessibility in Caption.Ninja

Caption.Ninja provides live captions in a separate browser page or as an overlay for a stream. The tips below cover the standard caption overlay. They do not describe a formal accessibility audit or claim conformance to an accessibility standard.

## Make captions easier to read

Copy the overlay URL from the capture page. Add these settings at the end of the URL to try larger white text on a solid black caption background:

```text
&fontsize=48px&color=ffffff&bg=000000&bgopacity=1
```

Use `?` instead of the first `&` if the URL has no query string. Adjust the size for your audience. Preview it at the final output size and over both bright and dark content, then check that multiline captions don't cover important information. An OBS overlay becomes part of the video; viewers can't resize those captions separately. When appropriate, also offer a direct overlay link so viewers can open captions in their own browser.

See the [setup and customization guide](README.md) for browser requirements, translation, and optional text-to-speech.

## Know the limits

- Automatic captions and translations can be wrong or delayed. For an event where people rely on captions, test the setup in advance and consider a human captioner when accuracy is critical.
- The standard overlay doesn't mark changing captions as a screen-reader live region. Don't assume a screen reader will automatically announce each update. Text-to-speech is a separate feature and isn't a substitute for testing with assistive technology.

## Report an accessibility barrier

[Open a GitHub issue](https://github.com/steveseguin/captionninja/issues/new) with the page or workflow, what you expected, what happened, and how to reproduce it. If relevant, include the browser, operating system, and assistive technology versions. Remove room IDs, API keys, and private captions from examples or screenshots.
