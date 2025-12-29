from __future__ import annotations

import os
import pathlib
import tempfile

from flask import Flask, jsonify, request, send_from_directory
from openai import OpenAI

app = Flask(__name__, static_folder="static", static_url_path="")

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}
DEFAULT_MAX_AUDIO_MB = 50
MAX_AUDIO_MB = int(os.getenv("MAX_AUDIO_MB", DEFAULT_MAX_AUDIO_MB))
app.config["MAX_CONTENT_LENGTH"] = MAX_AUDIO_MB * 1024 * 1024


@app.get("/")
def index() -> object:
    return send_from_directory(app.static_folder, "index.html")


def _is_allowed(filename: str) -> bool:
    return pathlib.Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


@app.post("/transcribe")
def transcribe() -> object:
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided."}), 400

    audio_file = request.files["audio"]
    if not audio_file.filename:
        return jsonify({"error": "Missing filename."}), 400
    if not _is_allowed(audio_file.filename):
        return (
            jsonify({"error": "Unsupported file type. Please upload an audio file."}),
            400,
        )

    language = request.form.get("language", "").strip() or None
    prompt = request.form.get("prompt", "").strip() or None

    client = OpenAI()
    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        audio_file.save(temp_file)
        temp_path = temp_file.name

    try:
        with open(temp_path, "rb") as handle:
            transcription_params = {
                "model": "whisper-1",
                "file": handle,
            }
            if language:
                transcription_params["language"] = language
            if prompt:
                transcription_params["prompt"] = prompt
            transcription = client.audio.transcriptions.create(**transcription_params)
        return jsonify({"text": transcription.text})
    finally:
        os.remove(temp_path)


@app.errorhandler(413)
def request_entity_too_large(_error: Exception) -> object:
    return (
        jsonify(
            {
                "error": "Audio file is too large.",
                "maxSizeMb": MAX_AUDIO_MB,
            }
        ),
        413,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
