from __future__ import annotations

import os
import pathlib
import tempfile

from flask import Flask, jsonify, request, send_from_directory
from openai import OpenAI

app = Flask(__name__, static_folder="static", static_url_path="")

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}


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

    client = OpenAI()
    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        audio_file.save(temp_file)
        temp_path = temp_file.name

    try:
        with open(temp_path, "rb") as handle:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=handle,
            )
        return jsonify({"text": transcription.text})
    finally:
        os.remove(temp_path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
