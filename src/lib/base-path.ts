/** GitHub Pages project site: https://henrysimon4260.github.io/zoning-agent/ */
export const BASE_PATH = "/zoning-agent";

export function authCallbackUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${BASE_PATH}/auth/callback/`;
}
