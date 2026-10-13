export type BinOp =
  | "+" | "-" | "*" | "/" | "%"
  | "==" | "!=" | "<" | ">" | "<=" | ">="
  | "and" | "or" | "contains" | "startswith" | "endswith";

export type Expr =
  | { k: "num"; v: number; line: number }
  | { k: "str"; parts: (string | Expr)[]; line: number }
  | { k: "bool"; v: boolean; line: number }
  | { k: "nothing"; line: number }
  | { k: "list"; items: Expr[]; line: number }
  | { k: "map"; entries: { key: string; value: Expr }[]; line: number }
  | { k: "var"; name: string; line: number }
  | { k: "unary"; op: "-" | "not"; e: Expr; line: number }
  | { k: "bin"; op: BinOp; l: Expr; r: Expr; line: number }
  | { k: "call"; callee: Expr; args: Expr[]; line: number }
  | { k: "index"; obj: Expr; idx: Expr; line: number }
  | { k: "prop"; obj: Expr; name: string; line: number }
  | { k: "ask"; target: string; prompt: Expr; line: number };

export type Secret = { env?: Expr; literal?: Expr };

export type Ability =
  | { kind: "files"; path: Expr; line: number }
  | { kind: "web"; line: number }
  | { kind: "shell"; line: number }
  | { kind: "gmail"; token: Secret; line: number }
  | { kind: "tools"; names: string[]; line: number }
  | { kind: "ask"; names: string[]; line: number };

export type Stmt =
  | { k: "set"; target: Expr; value: Expr; line: number }
  | { k: "say"; e: Expr; line: number }
  | { k: "add"; value: Expr; list: Expr; line: number }
  | { k: "remove"; value: Expr; from: Expr; line: number }
  | { k: "if"; branches: { cond: Expr; body: Stmt[] }[]; otherwise?: Stmt[]; line: number }
  | { k: "repeat"; count: Expr; body: Stmt[]; line: number }
  | { k: "forever"; body: Stmt[]; line: number }
  | { k: "foreach"; name: string; iter: Expr; body: Stmt[]; line: number }
  | { k: "while"; cond: Expr; body: Stmt[]; line: number }
  | { k: "stop"; line: number }
  | { k: "skip"; line: number }
  | { k: "fn"; name: string; params: string[]; body: Stmt[]; doc?: string; line: number }
  | { k: "give"; value?: Expr; line: number }
  | { k: "try"; body: Stmt[]; errName: string; handler: Stmt[]; line: number }
  | { k: "use"; path: string; line: number }
  | {
      k: "agent";
      name: string;
      model?: Expr;
      role?: Expr;
      key?: Secret;
      endpoint?: Expr;
      format?: "openai" | "anthropic" | "raw";
      authHeader?: Expr;
      abilities: Ability[];
      memory: boolean;
      input: string[];
      output: string[];
      line: number;
    }
  | { k: "team"; name: string; lead?: string; members: string[]; line: number }
  | { k: "tool"; name: string; params: string[]; body: Stmt[]; doc?: string; line: number }
  | { k: "chat"; target: string; line: number }
  | { k: "serve"; target: string; port?: Expr; line: number }
  | { k: "describe"; text: string; line: number }
  | { k: "expr"; e: Expr; line: number };
