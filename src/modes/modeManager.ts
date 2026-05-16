/**
 * Mode manager for switching between ASK, PLAN, and AGENT modes
 */

import type { Mode } from "../core/types";
import { EventEmitter } from "eventemitter3";

export interface ModeManagerEvents {
  modeChanged: (mode: Mode) => void;
}

export interface ModeConfig {
  allowTools: boolean;
  allowExecution: boolean;
  allowSideEffects: boolean;
  description: string;
}

export const ModeConfigs: Record<Mode, ModeConfig> = {
  ask: {
    allowTools: true,
    allowExecution: false,
    allowSideEffects: false,
    description: "Read-only analysis and explanations",
  },
  plan: {
    allowTools: true,
    allowExecution: false,
    allowSideEffects: false,
    description: "Task decomposition and planning",
  },
  agent: {
    allowTools: true,
    allowExecution: true,
    allowSideEffects: true,
    description: "Full execution with tool access",
  },
};

export class ModeManager extends EventEmitter<ModeManagerEvents> {
  private currentMode: Mode = "ask";

  getMode(): Mode {
    return this.currentMode;
  }

  setMode(mode: Mode): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.emit("modeChanged", mode);
    }
  }

  getConfig(): ModeConfig {
    return ModeConfigs[this.currentMode];
  }

  canExecuteTools(): boolean {
    return this.getConfig().allowTools;
  }

  canExecuteCommands(): boolean {
    return this.getConfig().allowExecution;
  }

  canHaveSideEffects(): boolean {
    return this.getConfig().allowSideEffects;
  }

  isReadOnly(): boolean {
    return !this.getConfig().allowSideEffects;
  }
}
