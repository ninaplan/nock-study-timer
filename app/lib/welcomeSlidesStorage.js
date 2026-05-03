export const WELCOME_SLIDES_DONE_KEY = 'nock_welcome_slides_done';

export function readWelcomeSlidesDone() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(WELCOME_SLIDES_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearWelcomeSlidesDone() {
  try {
    localStorage.removeItem(WELCOME_SLIDES_DONE_KEY);
  } catch {
    /* */
  }
}
