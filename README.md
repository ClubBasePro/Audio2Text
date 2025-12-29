# Audio2Text

A simple web app that lets you upload an audio file (MP3/WAV/etc.) and returns a transcript you can copy.

## Run locally

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Set the OpenAI API key:

   ```bash
   export OPENAI_API_KEY="your-key"
   ```

3. Start the server:

   ```bash
   python app.py
   ```

Then open http://localhost:5000.

## Deploy without Netlify

This app is a simple Flask service with a static frontend. You can deploy it on any
container-friendly platform (Render, Fly.io, Railway, DigitalOcean App Platform).

### Render example

1. Create a new **Web Service** from this repo.
2. Set the environment variable `OPENAI_API_KEY`.
3. Use the following settings:
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app`

### Fly.io example

1. Install the Fly CLI and run `fly launch`.
2. Set the secret: `fly secrets set OPENAI_API_KEY=your-key`.
3. Ensure the process runs `gunicorn app:app` (or `python app.py` for quick testing).
