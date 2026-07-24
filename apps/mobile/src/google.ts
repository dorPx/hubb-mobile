import type { GoogleAccount } from "./store";

/** Read-only scopes: profile/email + Calendar, Gmail, Contacts, Tasks, Drive. */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

export const GOOGLE_SERVICES = ["Calendar", "Gmail", "Contacts", "Tasks", "Drive"];

export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

export function isGoogleLive(g: GoogleAccount | null): boolean {
  return !!g && !!g.accessToken && g.expiresAt > Date.now() + 30_000;
}

async function gget<T>(token: string, url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(9_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchUserEmail(token: string): Promise<string> {
  const j = await gget<{ email?: string }>(token, "https://www.googleapis.com/oauth2/v3/userinfo");
  return j?.email ?? "";
}

export interface CalEvent {
  summary: string;
  time: string;
}

export async function fetchCalendarToday(token: string): Promise<CalEvent[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?singleEvents=true&orderBy=startTime&maxResults=10` +
    `&timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}`;
  const j = await gget<{ items?: { summary?: string; start?: { dateTime?: string; date?: string } }[] }>(token, url);
  return (j?.items ?? []).map((e) => {
    const dt = e.start?.dateTime;
    const time = dt ? new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "ALL DAY";
    return { summary: e.summary ?? "(untitled)", time };
  });
}

export async function fetchGmailUnread(token: string): Promise<number> {
  const j = await gget<{ messagesUnread?: number }>(
    token,
    "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX",
  );
  return j?.messagesUnread ?? 0;
}

export async function fetchTasks(token: string): Promise<string[]> {
  const j = await gget<{ items?: { title?: string; status?: string }[] }>(
    token,
    "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=10",
  );
  return (j?.items ?? [])
    .filter((t) => t.status !== "completed" && t.title)
    .map((t) => t.title as string);
}

export interface GoogleBrief {
  events: CalEvent[];
  unread: number;
  tasks: string[];
}

/** Everything BRIEF needs in one shot; tolerant of partial scope grants. */
export async function fetchGoogleBrief(token: string): Promise<GoogleBrief> {
  const [events, unread, tasks] = await Promise.all([
    fetchCalendarToday(token),
    fetchGmailUnread(token),
    fetchTasks(token),
  ]);
  return { events, unread, tasks };
}
