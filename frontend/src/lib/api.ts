/**
 * Backend API client for the IIM Interview Simulator.
 * All API calls go through this module.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Get stored user */
function getUserFromStorage(): any | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw || raw === "undefined") return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse user from localStorage", e);
    return null;
  }
}

/** Default request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 45_000;

/** Transient HTTP status codes worth retrying */
const RETRYABLE_STATUSES = [503, 504];

/** Make authenticated API request with timeout and retry logic */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  { timeoutMs = REQUEST_TIMEOUT_MS, retries = 1 } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  // Ensure cookies are sent with every request
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 401) {
        // Token expired or invalid — clear and redirect
        if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
      }

      // Retry on transient server errors
      if (RETRYABLE_STATUSES.includes(res.status) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      return res;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new Error(
          `Request to ${endpoint} timed out after ${timeoutMs / 1000}s. The server may be overloaded.`
        );
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      // Retry on network errors
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError ?? new Error(`Request to ${endpoint} failed after retries`);
}

// ============ Auth ============

export async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch (e) {
    // Ignore error on logout
  }
  localStorage.removeItem("user");
  window.location.href = "/";
}

export function ensureAuth() {
  if (!isAuthenticated()) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Not authenticated");
  }
}

export function getUser() {
  return getUserFromStorage();
}

export function isAuthenticated(): boolean {
  return !!getUser();
}

// ============ Profile ============

export async function uploadResume(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/profile/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Upload failed");
  }
  return res.json();
}

export async function pasteResume(text: string, name: string = "Pasted Resume") {
  const res = await apiFetch("/api/profile/paste", {
    method: "POST",
    body: JSON.stringify({ text, name }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Paste failed");
  }
  return res.json();
}

export async function getProfile(profileId: string) {
  const res = await apiFetch(`/api/profile/${profileId}`);
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function listProfiles() {
  const res = await apiFetch("/api/profile/");
  if (!res.ok) throw new Error("Failed to list profiles");
  return res.json();
}

export async function deleteProfile(profileId: string) {
  const res = await apiFetch(`/api/profile/${profileId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to delete profile");
  }
  return res.json();
}

// ============ Interview ============

export async function startInterview(
  profileId: string,
  persona: string = "skeptic",
  interviewType: string = "iim_general",
  targetIim?: string,
  hometown?: string,
  state?: string,
  interests?: string[]
) {
  const res = await apiFetch("/api/interview/start", {
    method: "POST",
    body: JSON.stringify({
      profile_id: profileId,
      persona,
      interview_type: interviewType,
      target_iim: targetIim,
      hometown: hometown || null,
      state: state || null,
      interests: interests || [],
    }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to start interview");
  }
  return res.json();
}

export async function respondToInterviewer(
  interviewId: string,
  answer: string
) {
  const res = await apiFetch(`/api/interview/${interviewId}/respond`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to process response");
  }
  return res.json();
}

export async function endInterview(interviewId: string) {
  const res = await apiFetch(`/api/interview/${interviewId}/end`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to end interview");
  return res.json();
}

export async function getInterview(interviewId: string) {
  const res = await apiFetch(`/api/interview/${interviewId}`);
  if (!res.ok) throw new Error("Failed to get interview");
  return res.json();
}

export async function listInterviewHistory() {
  const res = await apiFetch("/api/interview/user/history");
  if (!res.ok) throw new Error("Failed to get interview history");
  return res.json();
}

// ============ Evaluation ============

export async function getEvaluation(interviewId: string) {
  const res = await apiFetch(`/api/evaluation/${interviewId}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to get evaluation");
  }
  return res.json();
}

export async function deleteInterview(interviewId: string) {
  const res = await apiFetch(`/api/interview/${interviewId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to delete interview");
  }
  return res.json();
}

export async function deleteAllInterviews() {
  const res = await apiFetch("/api/interview/user/history/all", {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to delete all interviews");
  }
  return res.json();
}

export async function sendTelemetry(interviewId: string, interimText: string, stutterCount: number, mumbling: boolean, visionMetrics?: any) {
  const res = await apiFetch(`/api/interview/${interviewId}/telemetry`, {
    method: "POST",
    body: JSON.stringify({
      interim_text: interimText,
      stutter_count: stutterCount,
      mumbling: mumbling,
      vision_metrics: visionMetrics || null
    }),
  });
  if (!res.ok) {
    return { should_interject: false }; // Fail silently for telemetry
  }
  return res.json();
}

// ============ Personas / Profiles ============

export async function updateProfile(profileId: string, profileData: { name?: string; hometown?: string; state?: string; interests?: string[] }) {
  const res = await apiFetch(`/api/profile/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify(profileData),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to update persona");
  }
  return res.json();
}

export async function getProfileHistory(profileId: string) {
  const res = await apiFetch(`/api/profile/${profileId}/history`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to get persona history");
  }
  return res.json();
}

export async function setActiveProfileId(profileId: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("active_profile_id", profileId);
  }
}

// ============ News ============

export async function getDailyNews(categories: string[]) {
  const query = categories.length > 0 ? `?categories=${encodeURIComponent(categories.join(","))}` : "";
  const res = await apiFetch(`/api/news/${query}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to fetch news");
  }
  return res.json();
}

