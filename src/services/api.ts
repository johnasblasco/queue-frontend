// services/api.ts
import Pusher from "pusher-js";
import axios from "axios";

// Configuration from your Laravel .env - Pusher Cloud
const PUSHER_APP_KEY = "b79b331575d316ac7c34";
const PUSHER_APP_CLUSTER = "ap1";
const API_BASE_URL = "https://api-queue.slarenasitsolutions.com/public/api";

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
    private connectionCount = 0;

    connect() {
        // If already connected, just increment counter
        if (this.pusher && this.connected) {
            this.connectionCount++;
            return this.pusher;
        }

        // No authentication needed for public channels
        this.pusher = new Pusher(PUSHER_APP_KEY, {
            cluster: PUSHER_APP_CLUSTER,
            forceTLS: true
            // Remove authEndpoint since channels are public
        });

        this.connectionCount = 1;

        this.pusher.connection.bind('connected', () => {
            console.log("✅ Pusher connected successfully to cluster:", PUSHER_APP_CLUSTER);
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
            console.warn("Pusher not connected, connecting now...");
            this.connect();
        }

        try {
            let channel = this.channels.get(channelName);
            if (!channel) {
                channel = this.pusher!.subscribe(channelName);
                this.channels.set(channelName, channel);

                channel.bind('pusher:subscription_succeeded', () => {
                    console.log(`✅ Subscribed to channel: ${channelName}`);
                });

                channel.bind('pusher:subscription_error', (error: any) => {
                    console.error(`❌ Subscription error for ${channelName}:`, error);
                });
            }

            channel.bind(eventName, callback);
            return () => {
                channel.unbind(eventName, callback);
            };
        } catch (error) {
            console.error("❌ Error subscribing to channel:", error);
            return () => { };
        }
    }

    unsubscribe(channelName: string) {
        const channel = this.channels.get(channelName);
        if (channel && this.pusher) {
            this.pusher.unsubscribe(channelName);
            this.channels.delete(channelName);
            console.log(`🔴 Unsubscribed from channel: ${channelName}`);
        }
    }

    disconnect() {
        this.channels.forEach((channelName) => {
            this.unsubscribe(channelName);

        });
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
    // Real-time queue updates - CORRECTED: Your backend broadcasts to service-counter.{counter_id} channels
    onQueueUpdate(counterId: number, callback: (data: any) => void) {
        // Your ServiceQueueUpdated event broadcasts to: service-counter.{counter_id}
        return socketService.subscribe(`service-counter.${counterId}`, "ServiceQueueUpdated", callback);
    },

    // Listen to all queue updates across all counters (for Display component)
    onAnyQueueUpdate(callback: (data: any) => void) {
        // This will be used by components that need to listen to all counters
        // You'll need to subscribe to each counter individually in the component
        console.log("📢 Use onQueueUpdate with specific counterId, or subscribe to multiple counters manually");
        return () => { }; // No-op for this generic version
    },

    // HTTP endpoints for actions
    async listQueue(counterId: number | null = null) {
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
    },

    async skipPerson(queueId: number) {
        try {
            const res = await api.post(`/queue/skip/${queueId}`);
            return res.data;
        } catch (error: any) {
            console.error("Skip person error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to skip person"
            };
        }
    },

    async removePerson(queueId: number) {
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
    },

    async editPersonName(queueId: number, newName: string) {
        try {
            const res = await api.put(`/queue/edit-name/${queueId}`, { customer_name: newName });
            return res.data;
        } catch (error: any) {
            console.error("Edit name error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to edit name"
            };
        }
    },

    async resetQueue(counterId: number) {
        try {
            const res = await api.post(`/queue/reset/${counterId}`);
            return res.data;
        } catch (error: any) {
            console.error("Reset queue error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to reset queue"
            };
        }
    }
};

// ----------------------------
// ⚙️ Counters API - Pusher + HTTP
// ----------------------------

export const CounterService = {
    // Real-time counter updates - CORRECTED: Your QueueUpdated event broadcasts to service-counters
    onCounterUpdate(callback: (data: any) => void) {
        // Your QueueUpdated event broadcasts to: service-counters
        return socketService.subscribe("service-counters", "QueueUpdated", callback);
    },

    // HTTP endpoints
    async fetchCounters() {
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
    },

    async createCounter(data: { counter_name: string; prefix: string }) {
        try {
            const res = await api.post(`/create/counters`, data);
            return res.data;
        } catch (error: any) {
            console.error("Create counter error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to create counter"
            };
        }
    },

    async updateCounter(id: number, data: any) {
        try {
            const res = await api.post(`/update/counters/${id}`, data);
            return res.data;
        } catch (error: any) {
            console.error("Update counter error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to update counter"
            };
        }
    },

    async toggleCounter(id: number, status: string) {
        try {
            const res = await api.post(`/update/counters/${id}`, { status });
            return res.data;
        } catch (error: any) {
            console.error("Toggle counter error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to toggle counter"
            };
        }
    },

    async deleteCounter(id: number) {
        try {
            const res = await api.post(`/archive/counters/${id}`);
            return res.data;
        } catch (error: any) {
            console.error("Delete counter error:", error);
            return {
                success: false,
                message: error.response?.data?.message || "Failed to delete counter"
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