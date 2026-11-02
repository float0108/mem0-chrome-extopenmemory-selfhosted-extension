/** Preserve the explicitly configured API path, including reverse-proxy prefixes. */
export function normalizeApiUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Server URL must be an HTTP(S) API address without credentials or query parameters'
    );
  }
  return url.toString().replace(/\/+$/, '');
}

export function requireJson(contentType: string | null): void {
  if (!contentType?.toLowerCase().includes('application/json')) {
    throw new Error(
      '服务返回了网页而不是 JSON。请填写 API 地址（包括反向代理的路径前缀，例如 /backend），保存后刷新聊天页面。'
    );
  }
}
