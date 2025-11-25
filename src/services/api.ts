// services/api.ts
import Pusher from "pusher-js";
import axios from "axios";
import { throttle } from 'lodash';


// Configuration from your Laravel .env - Pusher Cloud
const PUSHER_APP_KEY = "b79b331575d316ac7c34";
const PUSHER_APP_CLUSTER = "ap1";
const API_BASE_URL = "https://api-queue.slarenasitsolutions.com/public/api";


const pendingRequests = new Map();
// Throttled API calls
const throttledFetchCounters = throttle(async () => {
    try {
        const res = await api.get(`/counters`);
        return res.data;
    } catch (error: any) {
        console.error("Fetch counters error:", error);
        return {
            success: false,
            message: error.response?.data?.message || "Failed to fetch counters"
        };
    }
}, 2000); // Only allow one counters call every 2 seconds

const throttledListQueue = throttle(async (counterId: number | null = null) => {
    try {
        const endpoint = counterId ? `/queue/${counterId}` : `/queue`;
        const res = await api.get(endpoint);
        return res.data;
    } catch (error: any) {
        console.error("List queue error:", error);
        return {
            success: false,
            message: error.response?.data?.message || "Failed to fetch queue"
        };
    }
}, 1000); // Only allow one queue call every 1 second


const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

// 🔐 Add token to every request
export const setAuthToken = (token: string | null) => {
    if (token) {
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        localStorage.setItem('auth_token', token);
    } else {
        delete api.defaults.headers.common["Authorization"];
        localStorage.removeItem('auth_token');
    }
};

// Get stored token
const getStoredToken = () => {
    return localStorage.getItem('auth_token');
};

class WebSocketService {
    private pusher: Pusher | null = null;
    private channels: Map<string, any> = new Map();

    connect() {
        if (this.pusher && this.connected) {
            return this.pusher;
        }

        this.pusher = new Pusher(PUSHER_APP_KEY, {
            cluster: PUSHER_APP_CLUSTER,
            forceTLS: true
        });

        this.pusher.connection.bind('connected', () => {
            console.log("✅ Pusher connected successfully");
        });

        this.pusher.connection.bind('disconnected', () => {
            console.log("❌ Pusher disconnected");
        });

        this.pusher.connection.bind('error', (error: any) => {
            console.error("❌ Pusher connection error:", error);
        });

        return this.pusher;
    }

    subscribe(channelName: string, eventName: string, callback: Function) {
        if (!this.pusher) {
            this.connect();
        }

        try {
            const channelKey = `${channelName}-${eventName}`;
            let channel = this.channels.get(channelKey);

            if (!channel) {
                channel = this.pusher!.subscribe(channelName);
                this.channels.set(channelKey, channel);

                channel.bind('pusher:subscription_succeeded', () => {
                    console.log(`✅ Subscribed to: ${channelName} for event: ${eventName}`);
                });

                channel.bind('pusher:subscription_error', (error: any) => {
                    console.error(`❌ Subscription error for ${channelName}:`, error);
                });
            }

            channel.bind(eventName, callback);

            // Return unsubscribe function
            return () => {
                if (channel) {
                    channel.unbind(eventName, callback);
                }
            };
        } catch (error) {
            console.error("❌ Error subscribing to channel:", error);
            return () => { };
        }
    }

    disconnect() {
        this.channels.clear();
        this.pusher?.disconnect();
        this.pusher = null;
        console.log("🔴 Pusher disconnected completely");
    }

    get connected(): boolean {
        return this.pusher?.connection.state === 'connected';
    }
}

export const socketService = new WebSocketService();

// ----------------------------
// 🔏 Authenticator
// ----------------------------
// ----------------------------
// 🔏 Authenticator
// ----------------------------

export async function login(username: string, password: string) {
    try {
        const res = await api.post("/login", { username, password });
        if (res.data.success && res.data.token) {
            setAuthToken(res.data.token);
            // Don't connect WebSocket here - let components handle their own connections
        }
        return res.data;
    } catch (error: any) {
        console.error("Login error:", error);
        return {
            success: false,
            message: error.response?.data?.message || "Login failed"
        };
    }
}

export async function logout() {
    try {
        const res = await api.post("/logout");
        // Don't disconnect WebSocket here - let components handle their own disconnections
        setAuthToken(null);
        return res.data;
    } catch (error: any) {
        console.error("Logout error:", error);
        setAuthToken(null);
        return {
            success: false,
            message: error.response?.data?.message || "Logout failed"
        };
    }
}

// ----------------------------
// 📌 Queue API - Pusher + HTTP
// ----------------------------

export const QueueService = {
    // Single listQueue method using the throttled fetch implementation
    async listQueue(counterId: number | null = null) {
        return await throttledListQueue(counterId);
    },

    // Listen to queue updates for specific counter - CORRECTED CHANNEL NAME
    onQueueUpdate(counterId: number, callback: (data: any) => void) {
        // Your backend uses: service-counter.{counterId}
        return socketService.subscribe(
            `service-counter.${counterId}`,
            "ServiceQueueUpdated",
            callback
        );
    },

    // Listen to counter-level updates (for counter stats)
    onCounterUpdate(counterId: number, callback: (data: any) => void) {
        // Your backend uses: service-counter.{counterId} for QueueUpdated events
        return socketService.subscribe(
            `service-counter.${counterId}`,
            "QueueUpdated",
            callback
        );
    },

    // Listen to all counters updates (for global stats)
    onAllCountersUpdate(callback: (data: any) => void) {
        // Your backend uses: service-counters for QueueUpdated events  
        return socketService.subscribe(
            "service-counters",
            "QueueUpdated",
            callback
        );
    },

    async addPerson(data: { customer_name: string; is_priority: boolean }) {
        try {
            const res = await api.post("/queue/add-person", data);
            return res.data;
        } catch (error: any) {
            console.error("Add person error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to add person"
            };
        }
    },

    async callNext(counterId: number) {
        try {
            const res = await api.post(`/queue/call-next/${counterId}`);
            return res.data;
        } catch (error: any) {
            console.error("Call next error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to call next person"
            };
        }
    },

    async recall(queueId: number) {
        try {
            const res = await api.post(`/queue/recall/${queueId}`);
            return res.data;
        } catch (error: any) {
            console.error("Recall error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to recall person"
            };
        }
    },

    async completeQueue(queueId: number) {
        try {
            const res = await api.post(`/queue/complete/${queueId}`);
            return res.data;
        } catch (error: any) {
            console.error("Complete queue error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to complete queue"
            };
        }
    }
};


// ----------------------------
// ⚙️ Counters API - Pusher + HTTP
// ----------------------------
export const CounterService = {
    async fetchCounters() {
        return await throttledFetchCounters();
    },
    // Listen to all counters updates
    onCounterUpdate(callback: (data: any) => void) {
        return socketService.subscribe("service-counters", "QueueUpdated", callback);
    },

    // Your existing HTTP methods...
    async fetchCountersRaw() {
        try {
            const res = await api.get(`/counters`);
            return res.data;
        } catch (error: any) {
            console.error("Fetch counters error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to fetch counters"
            };
        }
    }
};



// ----------------------------
// 🎯 Helper Functions (for backward compatibility)
// ----------------------------

export const addPerson = async (name: string, token?: string) => {
    if (token) setAuthToken(token);
    return QueueService.addPerson({
        customer_name: name,
        is_priority: false
    });
};

export const removePerson = async (queueId: number) => {
    try {
        const res = await api.delete(`/queue/remove/${queueId}`);
        return res.data;
    } catch (error: any) {
        console.error("Remove person error:", error);
        return {
            success: false,
            message: error.response?.data?.message || "Failed to remove person"
        };
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

// Initialize with stored token on module load
const initToken = getStoredToken();
if (initToken) {
    setAuthToken(initToken);
}

export default api;