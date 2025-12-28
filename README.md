# Audio2Text

A simple web app that lets you upload an audio file (MP3/WAV/etc.) and returns a transcript you can copy.

## Deploy on Netlify

1. Push this repo to your Git provider and connect it to a new Netlify site.
2. Set the environment variable `OPENAI_API_KEY` in the Netlify site settings.
3. Build settings:
   - Build command: *(leave empty)*
   - Publish directory: `static`

Netlify will automatically deploy the static site and the serverless function at
`/.netlify/functions/transcribe`.

## Local preview (optional)

If you have the Netlify CLI installed, you can run:

```bash
npm install
netlify dev
```

Then open the local URL that Netlify outputs and upload an audio file to transcribe.
