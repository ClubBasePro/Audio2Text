const Busboy = require("busboy");
const { Readable } = require("stream");
const { Blob, FormData, fetch: undiciFetch } = require("undici");

const fetchImpl = global.fetch ?? undiciFetch;

const DEFAULT_MAX_AUDIO_MB = 10;
const MAX_AUDIO_BYTES = (() => {
  const configuredMb = Number(process.env.MAX_AUDIO_MB);
  const mb = Number.isFinite(configuredMb) && configuredMb > 0
    ? configuredMb
    : DEFAULT_MAX_AUDIO_MB;
  return mb * 1024 * 1024;
})();

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

    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fileSize: MAX_AUDIO_BYTES },
    });
    let fileBuffer = Buffer.alloc(0);
    let filename = "";
    let mimeType = "";
    const fields = {};
    let hasFile = false;
    let fileTooLarge = false;

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
      file.on("limit", () => {
        fileTooLarge = true;
        file.resume();
      });
    });

    busboy.on("field", (fieldname, value) => {
      if (value) {
        fields[fieldname] = value;
      }
    });

    busboy.on("finish", () => {
      if (fileTooLarge) {
        reject(
          new Error(
            `Audio file is too large. Please upload a file under ${Math.round(
              MAX_AUDIO_BYTES / (1024 * 1024)
            )}MB.`
          )
        );
        return;
      }
      if (!fileBuffer.length) {
        reject(new Error("No audio file provided."));
        return;
      }
      resolve({ fileBuffer, filename, mimeType, fields });
    });

    busboy.on("error", reject);

    if (!event.body) {
      reject(new Error("Missing request body."));
      return;
    }

    const isMultipart = contentType.includes("multipart/form-data");
    const bodyEncoding = event.isBase64Encoded
      ? "base64"
      : isMultipart
      ? "binary"
      : "utf8";
    const body = Buffer.from(event.body, bodyEncoding);
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
    if (!fetchImpl || !global.FormData || !global.Blob) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "Server runtime missing fetch/FormData/Blob. Ensure Netlify is using Node 18+.",
        }),
      };
    }
    const contentLength = Number(event.headers?.["content-length"] || 0);
    if (contentLength && contentLength > MAX_AUDIO_BYTES) {
      return {
        statusCode: 413,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Audio file exceeds ${Math.round(
            MAX_AUDIO_BYTES / (1024 * 1024)
          )}MB. Netlify Functions have strict request size limits; host the proxy elsewhere for larger files or lower MAX_AUDIO_MB.`,
        }),
      };
    }
    const { fileBuffer, filename, mimeType, fields } =
      await parseMultipart(event);

    const formData = new global.FormData();
    const fileBlob = new global.Blob([fileBuffer], {
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
