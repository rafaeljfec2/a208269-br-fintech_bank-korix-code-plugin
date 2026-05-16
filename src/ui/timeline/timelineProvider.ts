/**
 * Timeline provider for execution history
 */

import * as vscode from "vscode";

interface TimelineItem {
  id: string;
  timestamp: number;
  type: "tool" | "message" | "checkpoint";
  description: string;
  status: "success" | "error" | "pending";
}

export class TimelineProvider implements vscode.TreeDataProvider<TimelineItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TimelineItem | undefined | null
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: TimelineItem[] = [];

  addItem(item: Omit<TimelineItem, "id">): void {
    const newItem: TimelineItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    this.items.push(newItem);
    this.refresh();
  }

  clear(): void {
    this.items = [];
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TimelineItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.description);
    item.tooltip = new Date(element.timestamp).toLocaleString();
    item.iconPath = new vscode.ThemeIcon(
      element.status === "success"
        ? "check"
        : element.status === "error"
          ? "error"
          : "clock",
    );
    return item;
  }

  getChildren(element?: TimelineItem): Thenable<TimelineItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve([...this.items].reverse());
  }
}
