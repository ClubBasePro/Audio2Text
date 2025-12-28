# Audio2Text

A simple web app that lets you upload an audio file (MP3/WAV/etc.) and returns a transcript you can copy.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Set your OpenAI API key so the server can call Whisper:

```bash
export OPENAI_API_KEY="your-key"
```

## Run

```bash
python app.py
```

Open <http://localhost:5000> in your browser and upload an audio file to transcribe.
