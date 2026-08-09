"use client";

import { useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Sparkle } from "@phosphor-icons/react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";

export function AssistantComposer({
  conversationId,
}: {
  conversationId?: string;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { conversationId, locale: "ru" },
      }),
    [conversationId],
  );
  const { messages, sendMessage, status, stop, error } = useChat({ transport });

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#bdd8cc] bg-[#f5faf7]">
      <div className="flex items-center justify-between border-b border-[#d7e6de] px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkle className="size-4" weight="fill" /> AI‑черновик для оператора
        </span>
        <span className="text-[11px] text-muted-foreground">
          AI Dos · без диагностики
        </span>
      </div>
      {messages.length > 0 && (
        <Conversation className="max-h-[260px] min-h-[120px]">
          <ConversationContent className="gap-4 p-4">
            {messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <MessageResponse key={index}>{part.text}</MessageResponse>
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}
      {messages.length === 0 && (
        <ConversationEmptyState
          className="min-h-[90px] py-4"
          description="Попросите AI подготовить ответ, резюме или следующий безопасный шаг."
          icon={<Sparkle className="size-5" />}
          title="AI готов помочь"
        />
      )}
      {error && (
        <p className="mx-3 mb-2 rounded-lg bg-[#fff1ee] px-3 py-2 text-xs text-[#a33d30]">
          {error.message}
        </p>
      )}
      <PromptInput
        className="m-3 rounded-[11px] bg-white"
        onSubmit={async ({ text }) => {
          if (text.trim()) await sendMessage({ text });
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            className="min-h-16 text-sm"
            placeholder="Например: подготовь короткий ответ и уточни удобное время…"
          />
        </PromptInputBody>
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit onStop={stop} status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
