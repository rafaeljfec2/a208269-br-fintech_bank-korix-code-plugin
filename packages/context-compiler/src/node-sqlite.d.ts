declare module "node:sqlite" {
  export const DatabaseSync: new (path: string) => unknown;
}
