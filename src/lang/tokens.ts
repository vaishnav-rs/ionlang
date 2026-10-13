export type StrPart = string | { expr: string; line: number };

export type Tok = {
  type: "word" | "number" | "string" | "op" | "newline" | "indent" | "dedent" | "eof";
  value: string;
  line: number;
  parts?: StrPart[];
};
