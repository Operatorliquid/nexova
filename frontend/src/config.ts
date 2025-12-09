export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";

export function buildApiUrl(path?: string | null) {
  if (!path) {
    return API_BASE_URL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith("/")) {
    return `${API_BASE_URL}${path}`;
  }

  return `${API_BASE_URL}/${path}`;
}
