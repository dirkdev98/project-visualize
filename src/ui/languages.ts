export const languages: Record<
  string,
  { aliases: string[]; dependencies: string[] }
> = {
  javascript: { aliases: ["js"], dependencies: [] },
  typescript: { aliases: ["ts"], dependencies: [] },
  jsx: { aliases: [], dependencies: ["javascript"] },
  tsx: { aliases: [], dependencies: ["typescript", "jsx"] },
  json: { aliases: [], dependencies: [] },
  python: { aliases: ["py"], dependencies: [] },
  shellscript: { aliases: ["sh", "bash", "shell"], dependencies: [] },
  css: { aliases: [], dependencies: [] },
  html: { aliases: ["htm"], dependencies: ["javascript", "css"] },
  sql: { aliases: [], dependencies: [] },
  rust: { aliases: ["rs"], dependencies: [] },
  c: { aliases: [], dependencies: [] },
  cpp: { aliases: ["c++"], dependencies: ["c"] },
};
