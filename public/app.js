const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("message");
const transcriptInput = document.getElementById("transcript");
const photoInput = document.getElementById("photo");
const fileName = document.getElementById("fileName");
const chatHistory = document.getElementById("chatHistory");

const removePhotoBtn = document.getElementById("removePhotoBtn");
const startVoiceBtn = document.getElementById("startVoiceBtn");
const submitBtn = document.getElementById("submitBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const statusMessage = document.getElementById("statusMessage");
const responseBox = document.getElementById("responseBox");
const responseContent = document.getElementById("responseContent");
const speakResponseBtn = document.getElementById("speakResponseBtn");
const responseMeta = document.getElementById("responseMeta");

const HISTORY_KEY = "homeHarmonyChatHistory";

let recognition = null;
let lastResponseText = "";
let speechSupported = false;

/* =========================
   HISTORY
========================= */
function saveHistory(messages) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
}

function loadHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
}

function addMessageToHistory(role, text, imageName = null, imageData = null) {
  const messages = loadHistory();

  messages.push({
    role,
    text,
    imageName,
    imageData,
    timestamp: new Date().toLocaleString()
  });

  saveHistory(messages);
  renderHistory();
}

function renderHistory() {
  if (!chatHistory) return;

  const messages = loadHistory();
  chatHistory.innerHTML = "";

  messages.forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = `chat-message ${msg.role}`;

    const textBlock = document.createElement("div");
    textBlock.textContent = msg.text || "";
    bubble.appendChild(textBlock);

    if (msg.imageName && msg.imageData) {
      const img = document.createElement("img");
      img.src = msg.imageData;
      img.className = "chat-image";
      img.alt = msg.imageName;
      bubble.appendChild(img);
    }

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = msg.timestamp;
    bubble.appendChild(meta);

    chatHistory.appendChild(bubble);
  });

  chatHistory.scrollTop = chatHistory.scrollHeight;
}

/* =========================
   IMAGE HANDLING
========================= */
function clearImage() {
  if (!photoInput) return;

  photoInput.value = "";
  if (fileName) fileName.textContent = "";
  if (removePhotoBtn) removePhotoBtn.style.display = "none";
  if (statusMessage) statusMessage.textContent = "Image removed.";
}

window.clearImage = clearImage;

if (photoInput) {
  photoInput.addEventListener("change", () => {
    if (photoInput.files.length > 0) {
      const file = photoInput.files[0];

      if (fileName) {
        fileName.textContent = `Selected image: ${file.name}`;
      }

      if (removePhotoBtn) {
        removePhotoBtn.style.display = "inline-block";
      }
    } else {
      if (fileName) fileName.textContent = "";
      if (removePhotoBtn) removePhotoBtn.style.display = "none";
    }
  });
}

if (removePhotoBtn) {
  removePhotoBtn.addEventListener("click", clearImage);
}

/* =========================
   CLEAR HISTORY
========================= */
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    if (statusMessage) statusMessage.textContent = "Chat history cleared.";
  });
}

/* =========================
   SPEECH RECOGNITION
========================= */
function setupSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    speechSupported = false;

    if (startVoiceBtn) {
      startVoiceBtn.disabled = true;
      startVoiceBtn.title = "Speech recognition is not supported in this browser";
    }

    if (statusMessage) {
      statusMessage.textContent =
        "Voice input works best in Chrome or Microsoft Edge.";
    }

    return;
  }

  speechSupported = true;
  recognition = new SpeechRecognition();
  recognition.lang = "en-GB";
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    if (statusMessage) statusMessage.textContent = "Listening...";
    if (startVoiceBtn) startVoiceBtn.classList.add("active");
  };

  recognition.onresult = (event) => {
    let transcript = "";

    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript + " ";
    }

    transcript = transcript.trim();

    if (transcriptInput) {
      transcriptInput.value = transcript;
    }

    if (messageInput && transcript) {
      messageInput.value = transcript;
      messageInput.focus();
    }
  };

  recognition.onerror = (event) => {
    if (statusMessage) {
      statusMessage.textContent = `Voice input error: ${event.error}`;
    }
    if (startVoiceBtn) startVoiceBtn.classList.remove("active");
  };

  recognition.onend = () => {
    if (startVoiceBtn) startVoiceBtn.classList.remove("active");
    if (statusMessage && statusMessage.textContent === "Listening...") {
      statusMessage.textContent = "Voice input captured.";
    }
  };
}

setupSpeechRecognition();

if (startVoiceBtn) {
  startVoiceBtn.addEventListener("click", () => {
    if (!speechSupported || !recognition) {
      if (statusMessage) {
        statusMessage.textContent =
          "Speech recognition is not supported in this browser. Use Chrome or Edge.";
      }
      return;
    }

    recognition.start();
  });
}

/* =========================
   CHAT SUBMIT
========================= */
if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const typedMessage = messageInput ? messageInput.value.trim() : "";
    const speechTranscript = transcriptInput ? transcriptInput.value.trim() : "";
    const photoFile =
      photoInput && photoInput.files.length > 0 ? photoInput.files[0] : null;

    if (!typedMessage && !speechTranscript && !photoFile) {
      if (statusMessage) {
        statusMessage.textContent =
          "Please type a question, upload an image, or use voice input.";
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (statusMessage) statusMessage.textContent = "Processing...";
    if (responseBox) responseBox.style.display = "none";
    if (responseContent) responseContent.textContent = "";
    if (responseMeta) responseMeta.textContent = "";
    if (speakResponseBtn) speakResponseBtn.style.display = "none";
    lastResponseText = "";

    try {
      const formData = new FormData();

      if (typedMessage) formData.append("message", typedMessage);
      if (speechTranscript) formData.append("transcript", speechTranscript);
      if (photoFile) formData.append("image", photoFile);

      if (photoFile) {
        const reader = new FileReader();
        reader.onload = function (event) {
          addMessageToHistory(
            "user",
            typedMessage || speechTranscript || "Uploaded an image",
            photoFile.name,
            event.target.result
          );
        };
        reader.readAsDataURL(photoFile);
      } else {
        addMessageToHistory("user", typedMessage || speechTranscript);
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || "Request failed.");
      }

      const reply = data.reply || "No response returned.";

      let sourceLabel = "";

      if (data.source === "knowledge_base") {
        sourceLabel = "Source: Knowledge Base";
      } else if (data.source === "knowledge_base_routine") {
        sourceLabel = "Source: Combined Knowledge Base Routine";
      } else if (data.source === "no_reliable_match") {
        sourceLabel = "Source: No Reliable Knowledge Base Match";
      } else if (data.source === "domain_restriction") {
        sourceLabel = "Source: Household Cleaning Only";
      } else if (data.source === "low_confidence") {
        sourceLabel = "Source: Low Confidence Match";
      } else if (data.source === "no_specific_kb") {
        sourceLabel = "Source: No Specific Knowledge Base Entry";
      }

      if (responseMeta) {
        responseMeta.textContent = sourceLabel;
      }

      if (responseContent) {
        responseContent.textContent = reply;
      }

      if (responseBox) {
        responseBox.style.display = "block";
      }

      lastResponseText = reply;
      addMessageToHistory("assistant", reply);

      if ("speechSynthesis" in window && reply.trim() && speakResponseBtn) {
        speakResponseBtn.style.display = "inline-block";
      }

      if (statusMessage) statusMessage.textContent = "Done.";

      if (messageInput) messageInput.value = "";
      if (transcriptInput) transcriptInput.value = "";
      clearImage();
    } catch (error) {
      console.error("Submit error:", error);
      if (statusMessage) {
        statusMessage.textContent = `Error: ${error.message}`;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/* =========================
   SPEAK RESPONSE
========================= */
if (speakResponseBtn) {
  speakResponseBtn.addEventListener("click", () => {
    if (!lastResponseText || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(lastResponseText);
    utterance.lang = "en-GB";
    utterance.rate = 1;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  });
}

/* =========================
   HELPERS
========================= */
function scrollToChat() {
  const chatSection = document.getElementById("chat");
  if (chatSection) {
    chatSection.scrollIntoView({ behavior: "smooth" });
  }
}

function prefillChat(text) {
  if (messageInput) {
    messageInput.value = text;
    messageInput.focus();
  }
  scrollToChat();
}

window.scrollToChat = scrollToChat;
window.prefillChat = prefillChat;

/* =========================
   INIT
========================= */
renderHistory();