/**
 * speechOutput.ts — TTS (Web Speech Synthesis) and speech bubble overlays.
 */

import type { AppState } from './appContext.js';

export function speak(text: string, state: AppState): void {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  utter.lang = 'en-US';
  if (state.listening && state.recognition) {
    state.recognition.stop();
    state.micPausedForTTS = true;
  }
  utter.onend = () => {
    if (state.micPausedForTTS && state.listening) {
      state.recognition.start();
      state.micPausedForTTS = false;
    }
  };
  window.speechSynthesis.speak(utter);
}

export function showSpeechBubble(stateId: string, message: string): void {
  document.querySelectorAll('.speech-bubble').forEach(b => b.remove());

  const node = document.querySelector(`[data-node="${stateId}"]`);
  if (!node) return;

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.textContent = message;
  document.body.appendChild(bubble);

  const rect = node.getBoundingClientRect();
  bubble.style.left = `${rect.right + 10}px`;
  bubble.style.top = `${rect.top + rect.height / 2}px`;
  bubble.style.transform = 'translateY(-50%)';
}

export function clearSpeechBubbles(): void {
  document.querySelectorAll('.speech-bubble').forEach(b => b.remove());
}
