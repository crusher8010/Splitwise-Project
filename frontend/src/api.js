const BASE = import.meta.env.VITE_API_URL || "http://localhost:8081";

// Small fetch wrapper: JSON in/out, optional bearer token, and errors that
// carry the backend's message so the UI can show it.
export async function api(path, { method = "GET", body, token } = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: body && JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || "Something went wrong");
    return json;
}
