# 相棒 Aibou — a Japanese speaking buddy

Aibou is a phone app for practising **spoken** Japanese. You talk to it in Japanese, and it talks back.

- **Voice first.** Tap the mic, speak Japanese, and Aibou answers out loud. Turn on *hands-free* and it starts listening again as soon as it finishes talking, so it feels like a real conversation.
- **Readings on everything.** Every sentence, yours and Aibou's, is split into words with furigana above the kanji and romaji underneath. Each can be toggled on or off.
- **Tap any word to look it up.** You get the reading, the meaning in context, and the dictionary form. *Explain more* adds nuance, a JLPT level, and example sentences. You can save words to your list and search for new ones.
- **Gentle corrections.** If something you said was unnatural, a green card under your message shows the more natural phrasing (tap it to hear it) and explains why.
- **Ask about anything.** Ask in English: "what's the difference between は and が?", "why ました here?". The explanation appears in a yellow note, and the conversation carries on in Japanese. The *Explain* button on any reply breaks that sentence down for you.
- **Stuck?** Tap 💡 for three things you could say next. Tap one to hear it, then try saying it yourself.
- Settings for level (beginner, elementary, intermediate), topic or scenario ("ordering at a café"), speaking speed, and AI model.

## How it works

| Piece | Runs where | What it uses |
|---|---|---|
| Speech → text (your voice) | **On the phone** where possible | Apple Speech (iOS) / Google (Android) via `expo-speech-recognition`, with `requiresOnDeviceRecognition` so audio stays on the device. It falls back to Apple's or Google's servers only if no on-device Japanese model is installed. |
| Text → speech (Aibou's voice) | **On the phone** | The system Japanese voice via `expo-speech`. For a much nicer voice on iOS, download an *Enhanced* Japanese voice in Settings → Accessibility → Spoken Content → Voices → Japanese. Aibou picks it up automatically. |
| Romaji | **On the phone** | Computed from the kana readings with `wanakana` |
| Conversation, corrections, readings, explanations | Cloud | Claude via the Anthropic API, using structured outputs so every reply arrives already split into words with readings and glosses |
| Your chats, saved words, settings | **On the phone** | AsyncStorage. Your API key is stored in the iOS Keychain / Android Keystore. |

### Why the "brain" isn't on the phone (yet)

Speech in both directions already runs locally. The language model is the part that isn't, because models small enough for a phone (1–4B parameters) are still weak at exactly what a tutor needs: accurate readings for kanji, catching subtle grammar mistakes, and explaining *why* in clear English. A tutor that confidently teaches you the wrong reading does more harm than good, so for now the app uses Claude.

The AI calls all go through [`src/lib/ai.ts`](src/lib/ai.ts) (`buddyTurn`, `lookupWord`, `suggestReplies`). A local model could be added behind those same three functions using [`llama.rn`](https://github.com/mybigday/llama.rn) and a small GGUF model (e.g. a Qwen or Gemma variant with good Japanese), perhaps as an "offline mode" for casual chat.

## Running it on your iPhone

The app uses native speech modules, so it needs a **development build**. The stock *Expo Go* app won't work. You'll also need an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/), which you paste into the app's Settings screen.

```bash
npm install
```

**Option A: you have a Mac with Xcode.** Plug in your iPhone and run:

```bash
npx expo run:ios --device
```

(Change `ios.bundleIdentifier` in `app.json` from `com.example.aibou` to something unique first, e.g. `com.yourname.aibou`, and pick your Apple ID as the signing team when Xcode asks.)

**Option B: no Mac.** Build in the cloud with EAS (needs a free Expo account; installing on a real iPhone needs an Apple Developer account):

```bash
npx eas-cli@latest build --profile development --platform ios
```

After installing the build, run `npx expo start` on your computer and open the app on your phone. Code changes then reload instantly.

**Android:** `npx expo run:android`, or `npx eas-cli@latest build --profile development --platform android` for an installable APK. For on-device recognition, install the Japanese offline speech pack (Google app → Settings → Voice → Offline speech recognition).

**Quick UI check in a browser:** `npx expo start --web`. Speech recognition works in Chrome via the Web Speech API.

## Choosing a model

Settings → AI model:

- **Claude Opus 5** (default): the best corrections and explanations.
- **Claude Sonnet 5**: faster replies at a lower cost per message, which suits long casual chats.

Conversations use prompt caching, so each new turn mostly pays only for the new messages.

## Project layout

```
src/
  app/                 screens (Expo Router)
    index.tsx          the conversation
    vocab.tsx          saved words + dictionary search
    settings.tsx       API key, level, voice & display options
  components/
    AnnotatedText.tsx  word-by-word sentence with furigana / romaji, tappable
    MessageBubble.tsx  your messages (with corrections) and Aibou's replies
    WordSheet.tsx      the word lookup sheet
  lib/
    ai.ts              Claude calls (conversation turn, word lookup, suggestions)
    prompts.ts         system prompts
    schemas.ts         structured-output schemas (zod)
    japanese.ts        romaji / furigana helpers (+ tests)
    useSpeechInput.ts  push-to-talk Japanese speech recognition
    voice.ts           Japanese text-to-speech
    store.ts           persisted chat, vocab, and settings (zustand)
```

## Development

```bash
npm run typecheck
npm test
```
