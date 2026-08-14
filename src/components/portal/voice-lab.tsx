"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  GoogleGenAI,
  type FunctionCall,
  type LiveServerMessage,
  type Session as GeminiLiveSession,
} from "@google/genai";
import {
  CheckCircle,
  DownloadSimple,
  Microphone,
  PaperPlaneTilt,
  PhoneDisconnect,
  Play,
  Record,
  SpinnerGap,
  Waveform,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  geminiLiveTools,
  geminiToolErrorResponse,
  geminiToolSuccessResponse,
} from "@/lib/voice/gemini-tools";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TranscriptItem = {
  role: "patient" | "assistant" | "system";
  text: string;
  at: string;
};

type SessionState = "idle" | "connecting" | "live" | "stopping" | "error";

const languageOptions = [
  { value: "auto", label: "Автоопределение" },
  { value: "kk", label: "Қазақша" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

const voiceOptions = [
  { value: "Zephyr", label: "Zephyr · естественный" },
  { value: "Kore", label: "Kore · уверенный" },
  { value: "Puck", label: "Puck · энергичный" },
  { value: "Aoede", label: "Aoede · тёплый" },
  { value: "Charon", label: "Charon · спокойный" },
];

function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] || 0);
}

function parseApiError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return "Не удалось запустить голосовую сессию.";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function floatToPcm16(input: Float32Array) {
  const bytes = new Uint8Array(input.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    view.setInt16(
      index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return bytes;
}

function appendTranscript(current: string, next?: string) {
  const value = next?.trim();
  if (!value) return current;
  if (!current) return value;
  if (value.startsWith(current)) return value;
  if (current.endsWith(value)) return current;
  return `${current}${/^[,.;!?…]/.test(value) ? "" : " "}${value}`;
}

export function VoiceLab() {
  const [status, setStatus] = useState<SessionState>("idle");
  const [language, setLanguage] = useState("auto");
  const [voice, setVoice] = useState("Zephyr");
  const [consent, setConsent] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [latencies, setLatencies] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [testMessage, setTestMessage] = useState("");

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const keepAliveGainRef = useRef<GainNode | null>(null);
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackCursorRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const latencyRef = useRef<number[]>([]);
  const speechStartedRef = useRef<number | null>(null);
  const inputSpeakingRef = useRef(false);
  const quietFramesRef = useRef(0);
  const inputTranscriptRef = useRef("");
  const outputTranscriptRef = useRef("");
  const startedAtRef = useRef<number | null>(null);
  const intentionalCloseRef = useRef(false);
  const transcriptTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "live") return;
    const timer = window.setInterval(() => {
      setElapsed(
        startedAtRef.current
          ? Math.floor((Date.now() - startedAtRef.current) / 1000)
          : 0,
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(
    () => () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    },
    [recordingUrl],
  );

  function addTranscript(item: TranscriptItem) {
    const previous = transcriptRef.current.at(-1);
    if (previous?.role === item.role && previous.text === item.text) return;
    transcriptRef.current = [...transcriptRef.current, item];
    setTranscript(transcriptRef.current);
  }

  function flushTranscript() {
    if (inputTranscriptRef.current.trim()) {
      addTranscript({
        role: "patient",
        text: inputTranscriptRef.current.trim(),
        at: new Date().toISOString(),
      });
      inputTranscriptRef.current = "";
    }
    if (outputTranscriptRef.current.trim()) {
      addTranscript({
        role: "assistant",
        text: outputTranscriptRef.current.trim(),
        at: new Date().toISOString(),
      });
      outputTranscriptRef.current = "";
    }
  }

  function scheduleTranscriptFlush(delay = 350) {
    if (transcriptTimerRef.current) {
      window.clearTimeout(transcriptTimerRef.current);
    }
    transcriptTimerRef.current = window.setTimeout(() => {
      flushTranscript();
      transcriptTimerRef.current = null;
    }, delay);
  }

  async function persistSession(
    nextStatus: "connected" | "completed" | "failed",
    errorCode?: string,
  ) {
    if (!sessionIdRef.current) return;
    await fetch("/api/realtime/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        status: nextStatus,
        transcript: transcriptRef.current,
        latencyMs: median(latencyRef.current),
        errorCode,
      }),
      keepalive: nextStatus !== "connected",
    }).catch(() => undefined);
  }

  function stopPlayback() {
    playbackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may have already ended naturally.
      }
    });
    playbackSourcesRef.current.clear();
    playbackCursorRef.current = audioContextRef.current?.currentTime || 0;
  }

  function playPcmAudio(base64: string, sampleRate = 24_000) {
    const audioContext = audioContextRef.current;
    const recordingDestination = recordingDestinationRef.current;
    if (!audioContext || !recordingDestination) return;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      channel[index] = view.getInt16(index * 2, true) / 0x8000;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.connect(recordingDestination);
    const startAt = Math.max(audioContext.currentTime + 0.015, playbackCursorRef.current);
    playbackCursorRef.current = startAt + buffer.duration;
    playbackSourcesRef.current.add(source);
    source.onended = () => playbackSourcesRef.current.delete(source);
    source.start(startAt);

    if (speechStartedRef.current !== null) {
      const value = Math.round(performance.now() - speechStartedRef.current);
      speechStartedRef.current = null;
      latencyRef.current = [...latencyRef.current, value];
      setLatencies(latencyRef.current);
    }
  }

  async function executeToolCalls(calls: FunctionCall[]) {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !sessionRef.current) return;

    const functionResponses = await Promise.all(
      calls.map(async (call) => {
        const name = call.name || "unknown_tool";
        const id = call.id || crypto.randomUUID();
        try {
          const response = await fetch("/api/gemini/live/tool", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              callId: id,
              name,
              args: call.args || {},
            }),
          });
          const payload = (await response.json()) as {
            ok?: boolean;
            data?: unknown;
            error?: { message?: string };
          };
          if (!response.ok || !payload.ok) {
            return geminiToolErrorResponse(
              { id, name },
              payload.error?.message || "Не удалось получить данные клиники.",
            );
          }
          return geminiToolSuccessResponse({ id, name }, payload.data);
        } catch {
          return geminiToolErrorResponse(
            { id, name },
            "Сервис данных клиники временно недоступен.",
          );
        }
      }),
    );

    sessionRef.current?.sendToolResponse({ functionResponses });
  }

  function handleLiveMessage(message: LiveServerMessage) {
    const calls = message.toolCall?.functionCalls;
    if (calls?.length) void executeToolCalls(calls);

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      stopPlayback();
      scheduleTranscriptFlush(50);
    }

    inputTranscriptRef.current = appendTranscript(
      inputTranscriptRef.current,
      content.inputTranscription?.text,
    );
    outputTranscriptRef.current = appendTranscript(
      outputTranscriptRef.current,
      content.outputTranscription?.text,
    );

    for (const part of content.modelTurn?.parts || []) {
      const data = part.inlineData?.data;
      if (!data) continue;
      const rateMatch = part.inlineData?.mimeType?.match(/rate=(\d+)/i);
      playPcmAudio(data, rateMatch ? Number(rateMatch[1]) : 24_000);
    }

    if (content.turnComplete || content.generationComplete) {
      scheduleTranscriptFlush();
    }
  }

  function setupAudioInput(
    stream: MediaStream,
    audioContext: AudioContext,
    recordingDestination: MediaStreamAudioDestinationNode,
  ) {
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(recordingDestination);

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processorRef.current = processor;
    keepAliveGainRef.current = silentGain;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    processor.onaudioprocess = (event) => {
      const session = sessionRef.current;
      if (!session) return;
      const input = event.inputBuffer.getChannelData(0);
      let energy = 0;
      for (let index = 0; index < input.length; index += 1) {
        energy += input[index] * input[index];
      }
      const rms = Math.sqrt(energy / input.length);
      if (rms > 0.018) {
        quietFramesRef.current = 0;
        if (!inputSpeakingRef.current) {
          inputSpeakingRef.current = true;
          speechStartedRef.current = performance.now();
        }
      } else if (inputSpeakingRef.current) {
        quietFramesRef.current += 1;
        if (quietFramesRef.current >= 4) {
          inputSpeakingRef.current = false;
          quietFramesRef.current = 0;
        }
      }

      session.sendRealtimeInput({
        audio: {
          data: bytesToBase64(floatToPcm16(input)),
          mimeType: `audio/pcm;rate=${audioContext.sampleRate}`,
        },
      });
    };
  }

  function startRecorder(recordingDestination: MediaStreamAudioDestinationNode) {
    const chunks: Blob[] = [];
    const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(recordingDestination.stream, {
      mimeType: preferredType,
    });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      if (!chunks.length) return;
      setRecordingUrl(URL.createObjectURL(new Blob(chunks, { type: preferredType })));
    };
    recorder.start(500);
  }

  async function start() {
    if (
      !consent ||
      status === "connecting" ||
      status === "live" ||
      status === "stopping"
    )
      return;
    setStatus("connecting");
    setError(null);
    setElapsed(0);
    setTranscript([]);
    setLatencies([]);
    transcriptRef.current = [];
    latencyRef.current = [];
    inputTranscriptRef.current = "";
    outputTranscriptRef.current = "";
    intentionalCloseRef.current = false;
    sessionIdRef.current = null;
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ latencyHint: "interactive" });
      await audioContext.resume();
      audioContextRef.current = audioContext;
      playbackCursorRef.current = audioContext.currentTime;
      const recordingDestination = audioContext.createMediaStreamDestination();
      recordingDestinationRef.current = recordingDestination;
      setupAudioInput(stream, audioContext, recordingDestination);
      startRecorder(recordingDestination);

      const tokenResponse = await fetch("/api/gemini/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice, language, recordingConsent: true }),
      });
      const tokenPayload = (await tokenResponse.json()) as {
        sessionId?: string;
        clientToken?: string;
        model?: string;
        error?: { message?: string };
      };
      if (!tokenResponse.ok) throw new Error(parseApiError(tokenPayload));
      if (!tokenPayload.clientToken || !tokenPayload.sessionId || !tokenPayload.model) {
        throw new Error("Сервер не вернул данные голосовой сессии.");
      }
      sessionIdRef.current = tokenPayload.sessionId;

      const client = new GoogleGenAI({
        apiKey: tokenPayload.clientToken,
        httpOptions: { apiVersion: "v1alpha" },
      });
      const session = await client.live.connect({
        model: tokenPayload.model,
        config: { tools: geminiLiveTools },
        callbacks: {
          onmessage: handleLiveMessage,
          onerror: (event) => {
            setError(event.message || "Потеряно соединение с Gemini Live.");
          },
          onclose: () => {
            if (intentionalCloseRef.current) return;
            cleanup();
            setError("Gemini Live закрыл соединение. Запустите тест ещё раз.");
            setStatus("error");
            void persistSession("failed", "websocket_closed");
          },
        },
      });
      sessionRef.current = session;
      startedAtRef.current = Date.now();
      setStatus("live");
      await persistSession("connected");
      session.sendClientContent({
        turns:
          language === "kk"
            ? "Қысқа амандасып, клиника атынан қалай көмектесе алатыныңды сұра."
            : language === "en"
              ? "Greet the patient briefly and ask how the clinic can help."
              : "Коротко поздоровайся от имени клиники и спроси, чем помочь.",
        turnComplete: true,
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Не удалось запустить голосовой тест.";
      setError(message);
      setStatus("error");
      await persistSession("failed", "connection_failed");
      cleanup();
    }
  }

  function cleanup() {
    intentionalCloseRef.current = true;
    if (transcriptTimerRef.current) {
      window.clearTimeout(transcriptTimerRef.current);
      transcriptTimerRef.current = null;
    }
    flushTranscript();
    try {
      sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      // The WebSocket may already be closed.
    }
    sessionRef.current?.close();
    stopPlayback();
    processorRef.current?.disconnect();
    keepAliveGainRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    void audioContextRef.current?.close();
    sessionRef.current = null;
    streamRef.current = null;
    recorderRef.current = null;
    processorRef.current = null;
    keepAliveGainRef.current = null;
    recordingDestinationRef.current = null;
    audioContextRef.current = null;
  }

  async function stop() {
    if (status !== "live") return;
    setStatus("stopping");
    cleanup();
    await persistSession("completed");
    setStatus("idle");
  }

  function sendTestMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = testMessage.trim();
    if (!message || status !== "live" || !sessionRef.current) return;

    addTranscript({
      role: "patient",
      text: message,
      at: new Date().toISOString(),
    });
    speechStartedRef.current = performance.now();
    sessionRef.current.sendClientContent({
      turns: message,
      turnComplete: true,
    });
    setTestMessage("");
  }

  const latency = median(latencies);
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const seconds = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-hidden rounded-[16px] border border-border bg-white/75">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Разговор с AI Dos</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Живой микрофон · Gemini Live · barge-in · автоматический язык
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${status === "live" ? "bg-[#e0f2e8] text-primary" : status === "error" ? "bg-[#fde9e5] text-destructive" : "bg-muted text-muted-foreground"}`}
          >
            <span
              className={`size-2 rounded-full ${status === "live" ? "animate-pulse bg-[#1a8b5f]" : status === "error" ? "bg-destructive" : "bg-[#9aa49f]"}`}
            />
            {status === "live"
              ? `В эфире ${minutes}:${seconds}`
              : status === "connecting"
                ? "Подключение"
                : status === "stopping"
                  ? "Завершение"
                  : status === "error"
                    ? "Ошибка"
                    : "Готов к тесту"}
          </span>
        </div>

        <div className="min-h-[390px] p-5">
          {transcript.length ? (
            <div className="space-y-4" aria-live="polite">
              {transcript.map((item, index) => (
                <div
                  className={`max-w-[86%] rounded-[14px] px-4 py-3 text-sm leading-6 ${item.role === "assistant" ? "bg-[#e6f2ec] text-primary" : "ml-auto bg-[#f0f2ee] text-foreground"}`}
                  key={`${item.at}-${index}`}
                >
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] opacity-65">
                    {item.role === "assistant" ? "AI Dos" : "Вы"}
                  </p>
                  {item.text}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[350px] flex-col items-center justify-center text-center">
              <span className="flex size-20 items-center justify-center rounded-full bg-[#e6f2ec] text-primary">
                {status === "connecting" ? (
                  <SpinnerGap className="size-9 animate-spin" />
                ) : (
                  <Waveform className="size-9" weight="duotone" />
                )}
              </span>
              <h3 className="mt-5 font-editorial text-2xl text-primary">
                Проверьте разговор как пациент
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Поздоровайтесь на любом языке, спросите цену, врача или свободное
                время. Во время ответа перебейте AI — он должен остановиться и
                услышать новую реплику.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div
            className="border-t border-[#efc7c1] bg-[#fff4f1] px-5 py-4 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <form
          className="border-t border-border bg-white/65 px-5 py-4"
          onSubmit={sendTestMessage}
        >
          <label
            className="text-xs font-semibold text-muted-foreground"
            htmlFor="voice-test-message"
          >
            Тестовый вопрос без микрофона
          </label>
          <div className="mt-2 flex gap-2">
            <input
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-white px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted"
              disabled={status !== "live"}
              id="voice-test-message"
              onChange={(event) => setTestMessage(event.target.value)}
              placeholder={
                status === "live"
                  ? "Например: какой адрес клиники?"
                  : "Сначала начните разговор"
              }
              value={testMessage}
            />
            <Button
              aria-label="Отправить тестовый вопрос"
              disabled={status !== "live" || !testMessage.trim()}
              type="submit"
              variant="outline"
            >
              <PaperPlaneTilt className="size-4" /> Отправить
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Ответ использует ту же базу знаний, расписание и настройки, что и
            голосовой разговор.
          </p>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-[#f7f8f4] px-5 py-4">
          <label className="flex max-w-xl items-start gap-3 text-xs leading-5 text-muted-foreground">
            <input
              checked={consent}
              className="mt-0.5 size-4 accent-[#075b3b]"
              disabled={status === "live" || status === "connecting"}
              onChange={(event) => setConsent(event.target.checked)}
              type="checkbox"
            />
            Я согласен на запись этого теста. Аудио остаётся в браузере и не
            загружается в облако; транскрипт и метрика задержки сохраняются в
            защищённой БД клиники.
          </label>
          {status === "live" ? (
            <Button onClick={stop} variant="destructive">
              <PhoneDisconnect className="size-4" /> Завершить
            </Button>
          ) : (
            <Button
              disabled={
                !consent || status === "connecting" || status === "stopping"
              }
              onClick={start}
            >
              {status === "connecting" ? (
                <SpinnerGap className="size-4 animate-spin" />
              ) : (
                <Microphone className="size-4" weight="fill" />
              )}
              Начать разговор
            </Button>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-[15px] border border-border bg-white/75 p-5">
          <h2 className="font-semibold">Параметры теста</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold text-muted-foreground">
              Язык старта
              <Select
                disabled={status === "live" || status === "connecting"}
                onValueChange={setLanguage}
                value={language}
              >
                <SelectTrigger className="mt-2 h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              Голос
              <Select
                disabled={status === "live" || status === "connecting"}
                onValueChange={setVoice}
                value={voice}
              >
                <SelectTrigger className="mt-2 h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {voiceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="rounded-[10px] border border-primary/20 bg-[#e6f2ec] px-3 py-3">
              <p className="text-xs font-semibold text-primary">Минимальная задержка</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Gemini 3.1 Flash Live · нативный аудиодиалог · автоматические перебивания
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[15px] border border-border bg-white/75 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Результат</h2>
            {recordingUrl && (
              <CheckCircle className="size-5 text-primary" weight="fill" />
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[10px] bg-muted p-3">
              <dt className="text-xs text-muted-foreground">Медиана ответа</dt>
              <dd className="mt-1 font-semibold">{latency ? `${latency} мс` : "—"}</dd>
            </div>
            <div className="rounded-[10px] bg-muted p-3">
              <dt className="text-xs text-muted-foreground">Реплик</dt>
              <dd className="mt-1 font-semibold">{transcript.length}</dd>
            </div>
          </dl>
          {recordingUrl ? (
            <div className="mt-4 space-y-3">
              <audio className="w-full" controls src={recordingUrl}>
                <track kind="captions" />
              </audio>
              <a
                className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border bg-white text-sm font-semibold text-primary transition hover:bg-muted"
                download={`ai-dos-voice-test-${new Date().toISOString().slice(0, 10)}.webm`}
                href={recordingUrl}
              >
                <DownloadSimple className="size-4" /> Скачать запись
              </a>
            </div>
          ) : (
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Record className="mt-0.5 size-4 shrink-0" /> После завершения
              появится локальная запись для прослушивания и скачивания.
            </p>
          )}
        </section>

        <section className="rounded-[15px] border border-[#c8dfe2] bg-[#edf8fa] p-5 text-sm leading-6 text-[#2f5961]">
          <p className="flex items-center gap-2 font-semibold">
            <Play className="size-4" weight="fill" /> Быстрый сценарий
          </p>
          <p className="mt-2">
            «Сәлеметсіз бе, маған ертең кардиолог керек». Затем: «Давайте
            продолжим по-русски». Спросите цену, свободное время и перебейте AI
            в середине ответа.
          </p>
        </section>
      </aside>
    </div>
  );
}
