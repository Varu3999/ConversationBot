// server.js

import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
dotenv.config();

import { RealtimeClient } from "@openai/realtime-api-beta";

// Express setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Set up view engine and static files
app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static("public"));

// Main Route
app.get("/", (req, res) => {
  res.render("index");
});

// Socket.io setup
io.on("connection", (socket) => {
  console.log("Initializing OpenAI client...");
  const client = new RealtimeClient({ apiKey: process.env.OPENAI_API_KEY });

  console.log("Updating session configuration...");
  client.updateSession({
    instructions: `You are a helpful assistant specialized EXCLUSIVELY in Indian tourism.
        CRITICAL INSTRUCTIONS:
        1. For ANY question that contains non-tourism content, even if part of it is about Indian tourism, respond with exactly:
           "I can only answer questions about tourism in India. Please ask me about Indian tourist destinations, culture, travel tips, or related topics."

        2. ONLY answer questions that are 100% focused on Indian tourism topics such as:
           - Tourist destinations in India
           - Indian cultural experiences and festivals
           - Indian cuisine and food tourism
           - Travel tips and planning for India
           - Accommodation and transportation in India
           - Indian heritage sites and monuments
           - Best times to visit specific Indian locations
           - Local customs and etiquette for tourists

        3. If a user asks multiple questions where ANY part is not about Indian tourism, DO NOT answer any part of it.
           For example, if they ask "Tell me about Indian tourism and who is Elon Musk?", respond with the standard message above.

        4. Stay focused on providing practical, tourism-related information that would be useful for someone planning to visit or currently traveling in India.`,
    voice: "alloy",
    turn_detection: { type: "server_vad", threshold: 0.3 },
    output_audio: { model: "audio-davinci", format: "pcm" },
    input_audio_transcription: { model: "whisper-1" },
  });

  console.log("Attempting to connect to OpenAI...");
  client
    .connect()
    .then(() => {
      console.log("Successfully connected to OpenAI");
    })
    .catch((error) => {
      console.error("Failed to connect:", error);
      socket.emit("error", "Failed to connect to OpenAI API.");
    });

  client.on("error", (error) => {
    console.error("Realtime API error:", error);
  });

  // Handle conversation updates for transcription and audio
  client.on("conversation.updated", (event) => {
    console.log("Conversation updated:", event);
    const { item, delta } = event;

    // Handle user input (partial or complete transcription)
    if (item.role === "user" && item.formatted.transcript) {
      socket.emit("displayUserMessage", {
        text: item.formatted.transcript,
        isFinal: item.status === "completed",
      });
    } else if (
      item.role === "user" &&
      item.formatted.audio?.length &&
      !item.formatted.transcript
    ) {
      // Emit placeholder while waiting for transcript if audio is present
      socket.emit("displayUserMessage", {
        text: "(awaiting transcript)",
        isFinal: false,
      });
    } else if (item.role === "user" && !item.formatted.transcript) {
      // Fallback in case neither transcript nor audio is present
      socket.emit("displayUserMessage", {
        text: "(item sent)",
        isFinal: true,
      });
    }

    // Send bot responses to the client
    if (item.role !== "user" && item.formatted.transcript) {
      console.log("Sending bot response:", item.formatted.transcript);
      socket.emit("conversationUpdate", {
        text: item.formatted.transcript,
        isFinal: item.status === "completed",
      });
    }

    // Send audio updates to client
    if (delta?.audio) {
      const audioData = delta.audio.buffer || delta.audio;
      socket.emit("audioStream", audioData, item.id);
    }
  });

  // Handle incoming audio data from the client
  socket.on("audioInput", async (data) => {
    if (data) {
      try {
        const buffer = new Uint8Array(data).buffer;
        const int16Array = new Int16Array(buffer);
        await client.appendInputAudio(int16Array);
      } catch (error) {
        console.error("Error processing audio data:", error);
      }
    }
  });

  // Handle conversation interruption
  client.on("conversation.interrupted", async () => {
    socket.emit("conversationInterrupted");
  });

  // Handle cancel response requests from the client
  socket.on("cancelResponse", async ({ trackId, offset }) => {
    if (trackId) {
      try {
        await client.cancelResponse(trackId, offset);
      } catch (error) {
        console.error("Error canceling response:", error);
      }
    }
  });

  socket.on("disconnect", () => {
    client.disconnect();
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
