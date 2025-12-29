const Busboy = require("busboy");
const { Readable } = require("stream");
const { Blob, FormData, fetch: undiciFetch } = require("undici");

const fetchImpl = global.fetch ?? undiciFetch;

if (!fetchImpl) {
  throw new Error("Fetch API is not available in this runtime.");
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

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
    if (!contentType.includes("multipart/form-data")) {
      reject(new Error("Unsupported Content-Type. Please upload a file."));
      return;
    }

    const busboy = Busboy({ headers: { "content-type": contentType } });
    let fileBuffer = Buffer.alloc(0);
    let filename = "";
    let mimeType = "";
    const fields = {};
    let hasFile = false;

    busboy.on("file", (_fieldname, file, info) => {
      if (hasFile) {
        file.resume();
        return;
      }
      hasFile = true;
      filename = info.filename || "audio";
      mimeType = info.mimeType || "application/octet-stream";
      file.on("data", (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
    });

    busboy.on("field", (fieldname, value) => {
      if (value) {
        fields[fieldname] = value;
      }
    });

    busboy.on("finish", () => {
      if (!fileBuffer.length) {
        reject(new Error("No audio file provided."));
        return;
      }
      if (fileBuffer.length > MAX_AUDIO_BYTES) {
        reject(
          new Error(
            "Audio file is too large. Please upload a file under 25MB."
          )
        );
        return;
      }
      resolve({ fileBuffer, filename, mimeType, fields });
    });

    busboy.on("error", reject);

    if (!event.body) {
      reject(new Error("Missing request body."));
      return;
    }

    const body = Buffer.from(
      event.body,
      event.isBase64Encoded ? "base64" : "binary"
    );
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
    const { fileBuffer, filename, mimeType, fields } =
      await parseMultipart(event);

    const formData = new FormData();
    const fileBlob = new Blob([fileBuffer], {
      type: mimeType || "application/octet-stream",
    });
    formData.append("file", fileBlob, filename);
    formData.append("model", "whisper-1");
    if (fields?.language) {
      formData.append("language", fields.language);
    }
    if (fields?.prompt) {
      formData.append("prompt", fields.prompt);
    }

    const fetchOptions = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    };

    const response = await fetchImpl(
      "https://api.openai.com/v1/audio/transcriptions",
      fetchOptions
    );
    const requestId =
      response.headers.get("x-request-id") ||
      response.headers.get("openai-request-id");

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
          requestId,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: data.text || "", requestId }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
