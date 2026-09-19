import { ALLOW_SIGNUP } from "astro:env/server";

export function isSignupEnabled() {
  return ALLOW_SIGNUP.toLowerCase() === "true";
}
