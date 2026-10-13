import { GrantKind, GrantNode } from "../../parser/ast.js";

export type ConfirmFn = (detail: {
  agent: string;
  grant: GrantKind;
  detail: string;
}) => Promise<boolean>;

export class GrantDeniedError extends Error {}
export class GrantNotDeclaredError extends Error {}

export class GrantManager {
  private agentName: string;
  private grants: Map<GrantKind, GrantNode>;
  private confirmFn: ConfirmFn;
  private autoYes: boolean;
  private confirmedOnce = new Set<GrantKind>();

  constructor(agentName: string, grants: GrantNode[], confirmFn: ConfirmFn, autoYes = false) {
    this.agentName = agentName;
    this.grants = new Map(grants.map((g) => [g.kind, g]));
    this.confirmFn = confirmFn;
    this.autoYes = autoYes;
  }

  has(kind: GrantKind): boolean {
    return this.grants.has(kind);
  }

  getScope(kind: GrantKind): string | undefined {
    return this.grants.get(kind)?.scope;
  }

  assert(kind: GrantKind): GrantNode {
    const grant = this.grants.get(kind);
    if (!grant) {
      throw new GrantNotDeclaredError(
        `agent '${this.agentName}' attempted to use grant '${kind}' which it does not hold`
      );
    }
    return grant;
  }

  /** Confirm-once semantics: the first use of a given grant kind in this agent's
   *  lifetime requires explicit confirmation (terminal prompt, UI prompt, or
   *  --yes auto-approval); subsequent uses of the same grant proceed silently. */
  async confirmOnce(kind: GrantKind, detail: string): Promise<void> {
    this.assert(kind);
    if (this.autoYes || this.confirmedOnce.has(kind)) return;
    const ok = await this.confirmFn({ agent: this.agentName, grant: kind, detail });
    if (!ok) {
      throw new GrantDeniedError(`agent '${this.agentName}': use of grant '${kind}' was denied`);
    }
    this.confirmedOnce.add(kind);
  }
}
