'use client';

import { useEffect, useRef, useState } from 'react';
import { demoLabels, modelQuestion } from '@/lib/i18n';
import type { DemoId, StreamEvent } from '@/lib/types';

type MessageInput =
  | { kind: 'bot'; text: string }
  | { kind: 'user'; text: string }
  | { kind: 'typing' };

type Message = MessageInput & { id: number };

type Choice = { question: string; options: string[]; onChoose: (v: string) => void };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function ChatThread({
  jobId,
  demoId,
  onVideoReady,
  onOpenVideo,
}: {
  jobId: string;
  demoId: DemoId;
  onVideoReady?: (url: string) => void;
  onOpenVideo?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [showWatchCta, setShowWatchCta] = useState(false);
  const idRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const planSizeRef = useRef<number | null>(null);
  const stitchedRef = useRef<string | null>(null);
  const phaseRef = useRef<'asking' | 'preparing' | 'done'>('asking');
  const onVideoReadyRef = useRef(onVideoReady);
  onVideoReadyRef.current = onVideoReady;

  // ---- SSE ingestion (silent, only watches for plan + final video) ----
  useEffect(() => {
    const es = new EventSource(`/api/stream/${jobId}`);
    es.onmessage = (msg) => {
      let ev: StreamEvent;
      try {
        ev = JSON.parse(msg.data);
      } catch {
        return;
      }
      switch (ev.type) {
        case 'plan_done':
          planSizeRef.current = ev.result.steps.length;
          break;
        case 'stitch_done':
          stitchedRef.current = ev.video_url;
          onVideoReadyRef.current?.(ev.video_url);
          break;
        case 'done':
        case 'error':
          es.close();
          break;
        default:
          break;
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);

  // ---- Conversation script ----
  useEffect(() => {
    let cancelled = false;
    const nextId = () => ++idRef.current;
    const labels = demoLabels[demoId];

    const push = (m: MessageInput) => {
      if (cancelled) return;
      setMessages((prev) => [...prev, { ...m, id: nextId() }]);
    };
    const removeTyping = () => {
      setMessages((prev) => prev.filter((m) => m.kind !== 'typing'));
    };
    const botSay = async (text: string) => {
      push({ kind: 'typing' });
      await sleep(700 + Math.min(1600, text.length * 18));
      if (cancelled) return;
      removeTyping();
      push({ kind: 'bot', text });
    };
    const ask = (question: string, options: string[]) =>
      new Promise<string>((resolve) => {
        if (cancelled) return resolve(options[0] ?? '');
        setChoice({
          question,
          options,
          onChoose: (v) => {
            setChoice(null);
            resolve(v);
          },
        });
      });

    (async () => {
      await sleep(500);
      if (cancelled) return;
      await botSay('Hi there. Let me take a look at your photo…');
      if (cancelled) return;
      await sleep(700);
      await botSay(`Looks like ${labels.problemPhrase}. Is that what you'd like to fix?`);
      if (cancelled) return;
      const confirm = await ask('Confirm', ['Yes, exactly', 'No, something else']);
      if (cancelled) return;
      push({ kind: 'user', text: confirm });
      if (confirm.startsWith('No')) {
        await botSay("No problem. Head back to the home page and pick another guide — I'll adapt.");
        return;
      }

      const modelQ = modelQuestion[demoId];
      if (modelQ) {
        await sleep(300);
        await botSay(modelQ.question);
        if (cancelled) return;
        const m = await ask('Model', modelQ.options);
        if (cancelled) return;
        push({ kind: 'user', text: m });
      }

      await sleep(300);
      await botSay('Great. Let me find the best repair procedure for your case…');
      if (cancelled) return;
      await sleep(1800);
      const n = planSizeRef.current;
      await botSay(
        n
          ? `Found a clear procedure — ${n} simple steps.`
          : 'Found a clear procedure that fits your case.',
      );
      if (cancelled) return;
      await sleep(500);
      await botSay("Now I'm preparing your repair video. This takes a moment…");
      phaseRef.current = 'preparing';

      const reveal = async () => {
        if (cancelled || phaseRef.current === 'done') return;
        await botSay(
          "I've pinpointed the issue on your photo. Tap the highlighted spot to watch the repair video.",
        );
        if (cancelled) return;
        phaseRef.current = 'done';
        setShowWatchCta(true);
      };

      if (stitchedRef.current) {
        await sleep(700);
        await reveal();
        return;
      }
      let waited = 0;
      while (!cancelled && !stitchedRef.current && waited < 90000) {
        await sleep(6000);
        waited += 6000;
        if (cancelled || stitchedRef.current) break;
        await botSay('Almost there…');
      }
      if (stitchedRef.current) await reveal();
    })();

    return () => {
      cancelled = true;
    };
  }, [demoId]);

  // ---- auto-scroll ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages, choice and CTA drive scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, choice, showWatchCta]);

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-[color:var(--color-border)] bg-white">
      <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-xs font-semibold text-white">
            AI
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-[color:var(--color-fg)]">
              Repair assistant
            </span>
            <span className="text-xs text-[color:var(--color-muted)]">
              {showWatchCta ? 'Diagnosis complete' : 'Online · analyzing your photo'}
            </span>
          </div>
        </div>
        {!showWatchCta ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[color:var(--color-accent)]" />
            live
          </span>
        ) : null}
      </div>

      <div className="flex min-h-[420px] flex-1 flex-col gap-3 px-5 pb-5 sm:min-h-[520px]">
        {messages.map((m) => {
          if (m.kind === 'typing') return <TypingBubble key={m.id} />;
          if (m.kind === 'bot') return <BotBubble key={m.id} text={m.text} />;
          return <UserBubble key={m.id} text={m.text} />;
        })}
        {choice ? (
          <div className="mt-1 flex flex-wrap gap-2 animate-[fade-in_220ms_ease-out]">
            {choice.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => choice.onChoose(opt)}
                className="rounded-full border border-[color:var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--color-fg)] transition hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
              >
                {opt}
              </button>
            ))}
          </div>
        ) : null}
        {showWatchCta && onOpenVideo ? (
          <button
            type="button"
            onClick={onOpenVideo}
            className="mt-2 inline-flex w-fit items-center gap-2 self-start rounded-md bg-[color:var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--color-accent-hover)]"
          >
            <PlayIcon /> Watch the repair video
          </button>
        ) : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function BotBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[85%] animate-[fade-in_220ms_ease-out] self-start whitespace-pre-line rounded-2xl rounded-bl-md bg-[color:var(--color-bubble-bot)] px-4 py-2.5 text-[15px] leading-relaxed text-[color:var(--color-fg)]">
      {text}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[85%] animate-[fade-in_220ms_ease-out] self-end rounded-2xl rounded-br-md bg-[color:var(--color-bubble-user)] px-4 py-2.5 text-[15px] leading-relaxed text-[color:var(--color-fg)]">
      {text}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="animate-[fade-in_140ms_ease-out] self-start rounded-2xl rounded-bl-md bg-[color:var(--color-bubble-bot)] px-4 py-3">
      <span className="inline-flex items-end gap-1">
        <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_infinite] rounded-full bg-[color:var(--color-subtle)]" />
        <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_-0.2s_infinite] rounded-full bg-[color:var(--color-subtle)]" />
        <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_-0.4s_infinite] rounded-full bg-[color:var(--color-subtle)]" />
      </span>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
    >
      <title>Play</title>
      <path d="M4 3l9 5-9 5V3z" />
    </svg>
  );
}
