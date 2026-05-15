/**
 * Backend API client for the IIM Interview Simulator.
 * All API calls go through this module.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Get stored auth token */
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

/** Make authenticated API request */
async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Token expired — clear and redirect
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
  }

  return res;
}

// ============ Auth ============

export async function register(email: string, password: string, name: string) {
  const res = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Registration failed");
  }
  const data = await res.json();
  localStorage.setItem("auth_token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));
  return data;
}

export async function login(email: string, password: string) {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Login failed");
  }
  const data = await res.json();
  localStorage.setItem("auth_token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));
  return data;
}

export function logout() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

export function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

// ============ Profile ============

export async function uploadResume(file: File) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/profile/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Upload failed");
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

// ============ Interview ============

export async function startInterview(
  profileId: string,
  persona: string = "skeptic",
  interviewType: string = "iim_general",
  targetIim?: string
) {
  const res = await apiFetch("/api/interview/start", {
    method: "POST",
    body: JSON.stringify({
      profile_id: profileId,
      persona,
      interview_type: interviewType,
      target_iim: targetIim,
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

// ============ Evaluation ============

export async function getEvaluation(interviewId: string) {
  const res = await apiFetch(`/api/evaluation/${interviewId}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to get evaluation");
  }
  return res.json();
}
