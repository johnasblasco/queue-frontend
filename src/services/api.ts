// services/api.ts
import Pusher from "pusher-js";
import axios from "axios";
import { throttle } from "lodash";

// CONFIG - update if needed
const PUSHER_APP_KEY = "b79b331575d316ac7c34";
const PUSHER_APP_CLUSTER = "ap1";
const API_BASE_URL = "https://api-queue.slarenasitsolutions.com/public/api";

// ------------ Axios instance ------------
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

// token helpers
export const setAuthToken = (token: string | null) => {
    if (token) {
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        localStorage.setItem("auth_token", token);
    } else {
        delete api.defaults.headers.common["Authorization"];
        localStorage.removeItem("auth_token");
    }
};
const getStoredToken = () => localStorage.getItem("auth_token");

// Initialize token if present
const initToken = getStoredToken();
if (initToken) setAuthToken(initToken);

// ------------ Throttled HTTP helpers ------------
const throttledFetchCounters = throttle(async () => {
    try {
        const res = await api.get(`/counters`);
        return res.data;
    } catch (error: any) {
        console.error("Fetch counters error:", error);
        return { success: false, message: error.response?.data?.message || "Failed to fetch counters" };
    }
}, 2000);

const throttledListQueue = throttle(async (counterId: number | null = null) => {
    try {
        const endpoint = counterId ? `/queue/${counterId}` : `/queue`;
        const res = await api.get(endpoint);
        return res.data;
    } catch (error: any) {
        console.error("List queue error:", error);
        return { success: false, message: error.response?.data?.message || "Failed to fetch queue" };
    }
}, 1000);

// ------------ Pusher wrapper ------------
class WebSocketService {
    private pusher: Pusher | null = null;
    // store channel objects keyed by channelName (not event) so multiple event binds can share same channel
    private channels: Map<string, any> = new Map();

    connect() {
        if (this.pusher && this.connected) return this.pusher;

        this.pusher = new Pusher(PUSHER_APP_KEY, {
            cluster: PUSHER_APP_CLUSTER,
            forceTLS: true,
        });

        this.pusher.connection.bind("connected", () => console.log("✅ Pusher connected successfully"));
        this.pusher.connection.bind("disconnected", () => console.log("❌ Pusher disconnected"));
        this.pusher.connection.bind("error", (err: any) => console.error("❌ Pusher error:", err));

        return this.pusher;
    }

    /**
     * Subscribe to a channel/event.
     * Returns an unsubscribe function which will unbind the callback from the event.
     */
    subscribe(channelName: string, eventName: string, callback: Function) {
        if (!this.pusher) this.connect();

        try {
            let channel = this.channels.get(channelName);
            if (!channel) {
                channel = this.pusher!.subscribe(channelName);
                this.channels.set(channelName, channel);

                channel.bind("pusher:subscription_succeeded", () => {
                    console.log(`✅ Subscribed to: ${channelName}`);
                });

                channel.bind("pusher:subscription_error", (err: any) => {
                    console.error(`❌ Subscription error for ${channelName}:`, err);
                });
            }

            // bind event to channel
            channel.bind(eventName, callback);

            // unsubscribe function: unbind the event handler
            const unsubscribe = () => {
                try {
                    channel.unbind(eventName, callback);
                    // Note: we intentionally don't call channel.unsubscribe() here, so other listeners can remain
                } catch (err) {
                    console.warn("Unsubscribe error:", err);
                }
            };

            return unsubscribe;
        } catch (err) {
            console.error("❌ subscribe error:", err);
            return () => { };
        }
    }

    disconnect() {
        this.channels.clear();
        this.pusher?.disconnect();
        this.pusher = null;
        console.log("🔴 Pusher disconnected completely");
    }

    get connected() {
        return this.pusher?.connection.state === "connected";
    }
}

export const socketService = new WebSocketService();

// ------------ Auth / Session helpers ------------
export async function login(username: string, password: string) {
    try {
        const res = await api.post("/login", { username, password });
        if (res.data.success && res.data.token) setAuthToken(res.data.token);
        return res.data;
    } catch (error: any) {
        console.error("Login error:", error);
        return { success: false, message: error.response?.data?.message || "Login failed" };
    }
}

export async function logout() {
    try {
        const res = await api.post("/logout");
        setAuthToken(null);
        return res.data;
    } catch (error: any) {
        console.error("Logout error:", error);
        setAuthToken(null);
        return { success: false, message: error.response?.data?.message || "Logout failed" };
    }
}

// ------------ QueueService (HTTP + Pusher bindings) ------------
export const QueueService = {
    // HTTP
    async listQueue(counterId: number | null = null) {
        return await throttledListQueue(counterId);
    },

    // Events (match Laravel events)
    // 1) Full-list broadcast event (your QueueListUpdated)
    onQueueListUpdate(callback: (data: any) => void) {
        // channel: service-counters, event: QueueListUpdated  (if you broadcast to global)
        return socketService.subscribe("service-counters", "QueueListUpdated", callback);
    },

    // full-list for specific counter: channel service-counter.{id}, event QueueListUpdated
    onQueueListUpdateForCounter(counterId: number, callback: (data: any) => void) {
        return socketService.subscribe(`service-counter.${counterId}`, "QueueListUpdated", callback);
    },

    // 2) Per-queue item events (ServiceQueueUpdated) - single queue item changes
    onServiceQueueUpdate(counterIdOrNull: number | null = null, callback?: (data: any) => void) {
        // If counterIdOrNull provided, subscribe to that counter channel, otherwise subscribe globally
        if (typeof counterIdOrNull === "number") {
            return socketService.subscribe(`service-counter.${counterIdOrNull}`, "ServiceQueueUpdated", callback!);
        }
        // fallback global - if your backend broadcasts per-counter only, this may do nothing
        return socketService.subscribe("service-counters", "ServiceQueueUpdated", callback!);
    },

    // 3) Basic queue updates for a counter (QueueUpdated) - typically counter stats changes
    onQueueUpdated(counterId: number, callback: (data: any) => void) {
        return socketService.subscribe(`service-counter.${counterId}`, "QueueUpdated", callback);
    },

    // 4) Global QueueUpdated (all counters) - channel service-counters
    onAllCountersUpdate(callback: (data: any) => void) {
        return socketService.subscribe("service-counters", "QueueUpdated", callback);
    },

    // HTTP actions
    async addPerson(data: { customer_name: string; is_priority: boolean }) {
        try {
            const res = await api.post("/queue/add-person", data);
            return res.data;
        } catch (error: any) {
            console.error("Add person error:", error);
            return { success: false, message: error.response?.data?.message || "Failed to add person" };
        }
    },

    async callNext(counterId: number) {
        try {
            const res = await api.post(`/queue/call-next/${counterId}`);
            return res.data;
        } catch (error: any) {
            console.error("Call next error:", error);
            return { success: false, message: error.response?.data?.message || "Failed to call next person" };
        }
    },

    async recall(queueId: number) {
        try {
            const res = await api.post(`/queue/recall/${queueId}`);
            return res.data;
        } catch (error: any) {
            console.error("Recall error:", error);
            return { success: false, message: error.response?.data?.message || "Failed to recall person" };
        }
    },

    async completeQueue(queueId: number) {
        try {
            const res = await api.post(`/queue/complete/${queueId}`);
            return res.data;
        } catch (error: any) {
            console.error("Complete queue error:", error);
            return { success: false, message: error.response?.data?.message || "Failed to complete queue" };
        }
    },
};

// ------------ CounterService ------------
export const CounterService = {
    async fetchCounters() {
        return await throttledFetchCounters();
    },

    // Subscribe to global counter events (QueueUpdated)
    onCounterUpdate(callback: (data: any) => void) {
        return socketService.subscribe("service-counters", "QueueUpdated", callback);
    },

    // raw HTTP fallback
    async fetchCountersRaw() {
        try {
            const res = await api.get(`/counters`);
            return res.data;
        } catch (error: any) {
            console.error("Fetch counters error:", error);
            return { success: false, message: error.response?.data?.message || "Failed to fetch counters" };
        }
    },
};

// ------------ Convenience exports (backwards compat) ------------
export const addPerson = async (name: string, token?: string) => {
    if (token) setAuthToken(token);
    return QueueService.addPerson({ customer_name: name, is_priority: false });
};

export const removePerson = async (queueId: number) => {
    try {
        const res = await api.delete(`/queue/remove/${queueId}`);
        return res.data;
    } catch (error: any) {
        console.error("Remove person error:", error);
        return { success: false, message: error.response?.data?.message || "Failed to remove person" };
    }
};

export const callNext = async (counterId: number, token?: string) => {
    if (token) setAuthToken(token);
    return QueueService.callNext(counterId);
};
export const recall = async (queueId: number, token?: string) => {
    if (token) setAuthToken(token);
    return QueueService.recall(queueId);
};
export const completeQueue = async (queueId: number, token?: string) => {
    if (token) setAuthToken(token);
    return QueueService.completeQueue(queueId);
};

export default api;
