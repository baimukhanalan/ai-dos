"use client";

import { SiteHeader } from "@/components/marketing/site-header";
import { StoryRail } from "@/components/marketing/story-rail";
import { Hero } from "@/components/marketing/hero";
import { StoryBody } from "@/components/marketing/story-body";
import { LocaleProvider, useLocale } from "@/components/marketing/locale-context";

function LandingContent() {
  const { t } = useLocale();
  const chapters = [
    { id: "intro", label: t.hero.railStart, tone: "light" as const },
    { id: "evening", label: t.evening.mark, tone: "light" as const },
    { id: "call", label: t.call.mark, tone: "light" as const },
    { id: "voice", label: t.voice.mark, tone: "light" as const },
    { id: "night", label: t.night.mark, tone: "light" as const },
    { id: "limits", label: t.limits.mark, tone: "light" as const },
    { id: "ground", label: t.ground.mark, tone: "light" as const },
  ];

  return (
    <>
      <SiteHeader />
      <StoryRail chapters={chapters} />
      <main>
        <Hero />
        <StoryBody />
      </main>
    </>
  );
}

export function LandingPage() {
  return (
    <div className="story min-h-screen overflow-x-hidden">
      <LocaleProvider>
        <LandingContent />
      </LocaleProvider>
    </div>
  );
}
