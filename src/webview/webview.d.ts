/**
 * Type declarations for CSS imports in webview
 */

declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}
