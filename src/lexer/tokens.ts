export type TokenType =
  | "IDENT"
  | "STRING"
  | "MODEL_REF"
  | "ENV_REF"
  | "EQEQ" // ==
  | "LBRACE"
  | "RBRACE"
  | "COMMA"
  | "NEWLINE"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}
