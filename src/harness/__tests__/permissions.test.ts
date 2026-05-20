import { describe, expect, it, vi } from "vitest";
import {
  PermissionManager,
  type ApprovalRequest,
  type ApprovalResponse,
} from "../permissions";

describe("PermissionManager", () => {
  const request: ApprovalRequest = {
    tool: "EditFile",
    input: { patches: "<KORIX_PATCH />" },
    description: "Apply a patch",
    riskLevel: "high",
  };

  it("should request approval through the injected requester", async () => {
    const requester = vi.fn(
      async (_request: ApprovalRequest): Promise<ApprovalResponse> => ({
        approved: true,
        level: "once",
      }),
    );
    const manager = new PermissionManager(requester);

    const response = await manager.checkPermission(request);

    expect(response.approved).toBe(true);
    expect(response.level).toBe("once");
    expect(requester).toHaveBeenCalledWith(request);
  });

  it("should remember always allow responses", async () => {
    const requester = vi.fn(
      async (_request: ApprovalRequest): Promise<ApprovalResponse> => ({
        approved: true,
        remember: true,
        level: "always",
      }),
    );
    const manager = new PermissionManager(requester);

    await manager.checkPermission(request);
    const secondResponse = await manager.checkPermission(request);

    expect(secondResponse.approved).toBe(true);
    expect(requester).toHaveBeenCalledTimes(1);
    expect(manager.getRule("EditFile")?.level).toBe("always");
  });

  it("should block denylisted input without prompting", async () => {
    const requester = vi.fn(
      async (_request: ApprovalRequest): Promise<ApprovalResponse> => ({
        approved: true,
        level: "once",
      }),
    );
    const manager = new PermissionManager(requester);

    const response = await manager.checkPermission({
      ...request,
      tool: "RunCommand",
      input: { command: "sudo rm -rf /" },
    });

    expect(response.approved).toBe(false);
    expect(requester).not.toHaveBeenCalled();
  });
});
