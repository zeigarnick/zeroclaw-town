import { CardType } from './validators';

export function getCanonicalCardTextForEmbedding(card: {
  type: CardType;
  title: string;
  summary: string;
  detailsForMatching: string;
  tags: string[];
  domains: string[];
  desiredOutcome: string;
}) {
  const sections = [
    `Type: ${card.type}`,
    `Title: ${normalizeText(card.title)}`,
    `Summary: ${normalizeText(card.summary)}`,
    `Details: ${normalizeText(card.detailsForMatching)}`,
    `Desired outcome: ${normalizeText(card.desiredOutcome)}`,
  ];
  if (card.tags.length > 0) {
    sections.push(`Tags: ${card.tags.map((tag) => tag.trim()).join(', ')}`);
  }
  if (card.domains.length > 0) {
    sections.push(`Domains: ${card.domains.map((domain) => domain.trim()).join(', ')}`);
  }
  return sections.join('\n');
}

function normalizeText(value: string) {
  return value.trim();
}
