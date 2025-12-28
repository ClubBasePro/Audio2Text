const Busboy = require("busboy");
const { Readable } = require("stream");

const parseMultipart = (event) =>
  new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: event.headers });
    let fileBuffer = Buffer.alloc(0);
    let filename = "";
    let mimeType = "";

    busboy.on("file", (_fieldname, file, info) => {
      filename = info.filename || "audio";
      mimeType = info.mimeType || "application/octet-stream";
      file.on("data", (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
    });

    busboy.on("finish", () => {
      if (!fileBuffer.length) {
        reject(new Error("No audio file provided."));
        return;
      }
      resolve({ fileBuffer, filename, mimeType });
    });

    busboy.on("error", reject);

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");
    Readable.from(body).pipe(busboy);
  });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Missing OPENAI_API_KEY environment variable.",
      }),
    };
  }

  try {
    const { fileBuffer, filename, mimeType } = await parseMultipart(event);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append("file", blob, filename);
    formData.append("model", "whisper-1");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: data.error?.message || "Transcription failed.",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: data.text || "" }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
