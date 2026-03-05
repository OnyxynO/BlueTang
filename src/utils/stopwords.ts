// Mots trop courts ou trop communs pour être pertinents dans une recherche de code
// Partagé entre le RAG (recherche.ts) et la pertinence MCP (pertinence.ts)
export const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'et', 'ou', 'si',
  'que', 'qui', 'quoi', 'dont', 'où', 'est', 'son', 'ses', 'sur', 'par',
  'pour', 'dans', 'avec', 'sans', 'sous', 'aux', 'au', 'ce', 'se', 'sa', 'il',
  'the', 'a', 'an', 'is', 'in', 'of', 'to', 'and', 'or', 'for', 'with', 'at',
  'do', 'what', 'how', 'why', 'when', 'where', 'does', 'fait', 'comment',
])
