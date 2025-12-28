const Busboy = require("busboy");
const FormData = require("form-data");
const { Readable } = require("stream");

const parseMultipart = (event) =>
  new Promise((resolve, reject) => {
    const headers = Object.fromEntries(
      Object.entries(event.headers || {}).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ])
    );
    const contentType = headers["content-type"];
    if (!contentType) {
      reject(new Error("Missing Content-Type header."));
      return;
    }

    const busboy = Busboy({ headers: { "content-type": contentType } });
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

    if (!event.body) {
      reject(new Error("Missing request body."));
      return;
    }

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body, "utf8");
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
    formData.append("file", fileBuffer, {
      filename,
      contentType: mimeType,
    });
    formData.append("model", "whisper-1");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders(),
        },
        body: formData,
      }
    );

    const responseText = await response.text();
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      data = {};
    }
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            data.error?.message ||
            responseText ||
            "Transcription failed.",
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
