import { expect, it, vi } from "vitest";

const databaseConstructor = vi.hoisted(() => vi.fn());
vi.mock("../../src/repositories/local-database", () => ({
  LocalDatabase: databaseConstructor,
}));

import { createLocalWorkspace } from "../../src/lib/create-local-workspace";

it("服务端可以导入客户端装配模块，但不能创建或打开数据库", () => {
  expect(typeof window).toBe("undefined");
  expect(databaseConstructor).not.toHaveBeenCalled();
  expect(() => createLocalWorkspace()).toThrow("只能在浏览器客户端挂载后");
  expect(databaseConstructor).not.toHaveBeenCalled();
});
