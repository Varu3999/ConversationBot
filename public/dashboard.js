// dashboard.js

import { WavRecorder, WavStreamPlayer } from "/wavtools/index.js";
const socket = io();

// DOM Elements
const conversation = document.getElementById("conversation");
const toggleButton = document.getElementById("toggle-button");
const micIcon = toggleButton.querySelector("i");
const micText = toggleButton.querySelector("span");

// Variables
let conversationMode = false;
let currentBotMessage = null;
let currentUserMessage = null;


// Audio Tools
const wavRecorder = new WavRecorder({ sampleRate: 24000 });
const wavStreamPlayer = new WavStreamPlayer({ sampleRate: 24000 });

// Initialize audio player
(async () => {
  await wavStreamPlayer.connect();
})();

// Event Listeners
toggleButton.addEventListener("click", toggleConversationMode);



// Display user message (typed or transcribed)
function displayUserMessage(message, isFinal = false) {
  if (!currentUserMessage) {
    currentUserMessage = document.createElement("div");
    currentUserMessage.textContent = `You: ${message}`;
    currentUserMessage.classList.add("message", "user-message");
    conversation.appendChild(currentUserMessage);
  } else {
    currentUserMessage.textContent = `You: ${message}`;
  }



  scrollToBottom();

  if (isFinal) {
    currentUserMessage = null;
  }
}

// Update bot message
function updateBotMessage(newText, isFinal = false) {
  if (!currentBotMessage) {
    currentBotMessage = document.createElement("div");
    currentBotMessage.classList.add("message", "bot-message");
    conversation.appendChild(currentBotMessage);
  }
  currentBotMessage.textContent = `Assistant: ${newText}`;
  scrollToBottom();

  if (isFinal) {
    currentBotMessage = null;
  }
}

// Scroll to bottom when new message is added
function scrollToBottom() {
  conversation.scrollTop = conversation.scrollHeight;
}

// Enable and disable conversation mode
async function toggleConversationMode() {
  try {
    if (!conversationMode) {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      conversationMode = true;
      toggleButton.classList.add("active");
      micIcon.className = "fas fa-stop";
      micText.textContent = "Stop";
      startRecording();
    } else {
      conversationMode = false;
      toggleButton.classList.remove("active");
      micIcon.className = "fas fa-microphone";
      micText.textContent = "Start";
      stopRecording();
    }
  } catch (error) {
    console.error("Error accessing microphone:", error);
    alert("Please allow microphone access to use voice input.");
  }
}

// Start recording mic input
async function startRecording() {
  try {
    await wavRecorder.begin();
    await wavRecorder.record((data) => {
      socket.emit("audioInput", data.mono);
    });
  } catch (error) {
    console.error("Error starting recording:", error);
    toggleConversationMode(); // Reset the button state
  }
}

// Stop recording mic input
async function stopRecording() {
  try {
    await wavRecorder.pause();
    await wavRecorder.end();
    socket.emit("stopRecording");
  } catch (error) {
    console.error("Error stopping recording:", error);
  }
}

// Socket Events
socket.on("displayUserMessage", ({ text, isFinal }) => {
  displayUserMessage(text, isFinal);
});

socket.on("conversationUpdate", ({ text, isFinal }) => {
  updateBotMessage(text, isFinal);
});

socket.on("audioStream", (arrayBuffer, id) => {
  if (arrayBuffer && arrayBuffer.byteLength > 0) {
    const int16Array = new Int16Array(arrayBuffer);
    wavStreamPlayer.add16BitPCM(int16Array, id);
  } else {
    console.warn("Received empty or invalid audio data.");
  }
});

socket.on("conversationInterrupted", async () => {
  const trackSampleOffset = await wavStreamPlayer.interrupt();
  if (trackSampleOffset?.trackId) {
    const { trackId, offset } = trackSampleOffset;
    socket.emit("cancelResponse", { trackId, offset });
  }
});
