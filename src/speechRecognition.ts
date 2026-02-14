/**
 * speechRecognition.ts — Web Speech API (STT) setup and mic button wiring.
 */

import type { AppState, DomRefs } from './appContext.js';

export function initSpeechRecognition(
  state: AppState,
  dom: DomRefs,
  processInput: (text: string) => void,
  logAppend: (type: string, text: string) => void,
): void {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    state.recognition = recognition;

    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          dom.partialEl.textContent = '';
          processInput(transcript);
        } else {
          interim += transcript;
        }
      }
      if (interim) dom.partialEl.textContent = interim;
    };

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        logAppend('system', `STT error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      if (state.listening && !state.micPausedForTTS) {
        try { recognition.start(); } catch (_) { /* ignore */ }
      }
    };
  } else {
    dom.micBtn.style.opacity = '0.3';
    (dom.micBtn as HTMLElement).title = 'Speech recognition not supported in this browser';
  }

  dom.micBtn.addEventListener('click', () => {
    if (!state.recognition) return;
    if (state.listening) {
      state.listening = false;
      state.recognition.stop();
      dom.micBtn.classList.remove('listening');
      dom.partialEl.textContent = '';
      logAppend('system', 'Mic off.');
    } else {
      state.listening = true;
      state.recognition.start();
      dom.micBtn.classList.add('listening');
      logAppend('system', 'Mic on \u2014 listening...');
    }
  });
}
