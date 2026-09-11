import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { FaBars, FaPaperclip, FaPaperPlane, FaRobot } from "react-icons/fa";

import { getSupabaseBrowserClient } from "../lib/supabase-browser";

declare global {
  interface Window {
    puter?: {
      auth?: { signIn?: () => Promise<unknown>; getUser?: () => Promise<unknown> };
      ai?: { chat?: (prompt: string, options?: { model?: string; stream?: boolean }) => Promise<unknown> };
    };
  }
}

type ChatMessage = { id: string; role: "user" | "assistant"; text: string; local?: boolean };

const MODEL = "deepseek/deepseek-v4.1-flash";
const ROOM = "sli";

export default function RoomsPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [online, setOnline] = useState(1);
  const [puterReady, setPuterReady] = useState(false);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>["channel"]> | null>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    script.onload = () => setPuterReady(true);
    document.head.appendChild(script);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return () => script.remove();

    const channel = supabase.channel(`agent-gpt-room:${ROOM}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const message = payload as ChatMessage;
        setMessages((current) => current.some((m) => m.id === message.id) ? current : [...current, message]);
      })
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(channel.presenceState()).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ online_at: new Date().toISOString() });
      });

    return () => {
      void supabase.removeChannel(channel);
      script.remove();
    };
  }, []);

  const broadcast = async (message: ChatMessage) => {
    await channelRef.current?.send({ type: "broadcast", event: "message", payload: message });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: text, local: true };
    setMessages((current) => [...current, userMessage]);
    await broadcast(userMessage);

    try {
      if (!window.puter?.ai?.chat) throw new Error("Puter is still loading");
      const result = await window.puter.ai.chat(text, { model: MODEL, stream: false });
      const raw = result as { message?: { content?: string }; toString?: () => string };
      const answer = raw?.message?.content ?? (typeof result === "string" ? result : raw?.toString?.() ?? "No response");
      const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: answer };
      setMessages((current) => [...current, assistantMessage]);
      await broadcast(assistantMessage);
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: error instanceof Error ? error.message : "Unable to reach DeepSeek.",
      };
      setMessages((current) => [...current, assistantMessage]);
      await broadcast(assistantMessage);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Head>
        <title>TEMPLATE OS Copilot</title>
        <meta name="description" content="Realtime AgentGPT room powered by Puter and DeepSeek V4.1 Flash" />
      </Head>
      <main className="min-h-screen bg-black text-white">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-black/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3"><FaBars /><FaRobot className="text-lime-400" /><div><div className="font-semibold">TEMPLATE OS Copilot</div><div className="text-xs text-zinc-500">Room / {ROOM}</div></div></div>
          <div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full bg-lime-400" /> {online} online</div>
        </header>

        <section className="mx-auto flex min-h-[calc(100vh-65px)] max-w-4xl flex-col px-4 pb-6">
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm">
            <span>Puter AI</span><span className="rounded-full border border-lime-900 bg-lime-950 px-3 py-1 text-xs text-lime-300">DeepSeek V4.1 Flash · free</span>
          </div>

          <div className="flex-1 space-y-4 py-6">
            {messages.length === 0 && <div className="flex min-h-[45vh] items-center justify-center text-center text-zinc-500"><div><FaRobot className="mx-auto mb-4 text-3xl text-lime-400" /><p>Start a conversation in the shared room.</p><p className="mt-1 text-xs">Realtime broadcast is enabled when Supabase env vars are configured.</p></div></div>}
            {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-3xl bg-lime-400 px-4 py-3 text-black" : "max-w-[85%] rounded-3xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100"}>{message.text}</div>)}
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={puterReady ? "Message TEMPLATE OS Copilot..." : "Loading Puter AI..."} rows={3} className="w-full resize-none bg-transparent px-3 py-2 text-white outline-none placeholder:text-zinc-600" />
            <div className="flex items-center justify-between px-2 pb-1"><button type="button" className="rounded-xl p-3 text-zinc-500 hover:text-white" aria-label="Attach"><FaPaperclip /></button><button type="button" onClick={() => void send()} disabled={!input.trim() || sending || !puterReady} className="rounded-xl bg-lime-400 p-3 text-black disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send"><FaPaperPlane /></button></div>
          </div>
        </section>
      </main>
    </>
  );
}
