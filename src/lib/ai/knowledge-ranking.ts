export type KnowledgeDocument = {
  id: string;
  title: string;
  locale: string;
  content: string;
};

const INTENT_TERM_GROUPS = [
  [
    "врач",
    "доктор",
    "специал",
    "дәрігер",
    "маман",
    "doctor",
    "specialist",
    "график",
    "расписан",
    "прием",
    "приём",
    "қабылдау",
    "schedule",
    "hours",
  ],
  [
    "адрес",
    "наход",
    "проезд",
    "мекенжай",
    "address",
    "location",
  ],
  [
    "подготов",
    "документ",
    "анализ",
    "дайын",
    "prepare",
    "preparation",
  ],
] as const;

function normalizedTerms(value: string) {
  return value
    .toLocaleLowerCase("ru-KZ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3);
}

export function rankKnowledgeDocuments(
  documents: KnowledgeDocument[],
  query: string,
  limit = 8,
) {
  const loweredQuery = query.toLocaleLowerCase("ru-KZ");
  const terms = new Set(normalizedTerms(query));

  for (const group of INTENT_TERM_GROUPS) {
    if (group.some((term) => loweredQuery.includes(term))) {
      group.forEach((term) => terms.add(term));
    }
  }

  return documents
    .map((document, index) => {
      const title = document.title.toLocaleLowerCase("ru-KZ");
      const content = document.content.toLocaleLowerCase("ru-KZ");
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 4;
        if (content.includes(term)) score += 1;
      }
      return { document, score, index };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((result) => result.document);
}
