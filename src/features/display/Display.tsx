// Display.tsx - FIXED VERSION
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Clock, Users, CheckCircle, Loader } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useDarkMode } from "@/contexts/DarkmodeContext";
import { QueueService, socketService, CounterService } from "@/services/api";

type QueueItem = {
    id: number;
    service_counter_id: number;
    queue_number: string;
    customer_name: string;
    is_priority: boolean | number;
    status: "waiting" | "serving" | "completed";
    created_at?: string;
    served_at?: string | null;
    timestamp?: string;
    counter?: any;
};

type CounterState = {
    currentServing: any | null;
    waitingQueue: any[];
    recentlyServed: any[];
    counterInfo: any | null;
};

const Display: React.FC = () => {
    const { darkMode } = useDarkMode();
    const [currentTime, setCurrentTime] = useState<Date>(new Date());
    const [counterData, setCounterData] = useState<Record<string, CounterState>>({});
    const [allCounters, setAllCounters] = useState<any[]>([]);
    const subs = useRef<(() => void)[]>([]);
    const isMounted = useRef(true);

    // --------------------------
    // Helpers: process incoming queue list (full) for a single counter
    // --------------------------
    const processQueueListUpdate = useCallback((counterId: number, queues: QueueItem[]) => {
        const key = String(counterId);

        setCounterData(prev => {
            const copy = { ...prev };
            if (!copy[key]) {
                copy[key] = {
                    currentServing: null,
                    waitingQueue: [],
                    recentlyServed: [],
                    counterInfo: null,
                };
            }

            // Reset arrays (QueueListUpdated is authoritative for this counter)
            copy[key].currentServing = null;
            copy[key].waitingQueue = [];
            copy[key].recentlyServed = [];

            // Populate
            queues.forEach(item => {
                const ts = item.created_at || item.timestamp || new Date().toISOString();

                if (item.status === "serving") {
                    copy[key].currentServing = {
                        id: item.id,
                        queueNumber: item.queue_number,
                        name: item.customer_name,
                        counterNumber: counterId,
                        timestamp: new Date(ts),
                    };
                } else if (item.status === "waiting") {
                    copy[key].waitingQueue.push({
                        id: item.id,
                        queueNumber: item.queue_number,
                        name: item.customer_name,
                        counterNumber: counterId,
                        timestamp: new Date(ts),
                    });
                } else if (item.status === "completed") {
                    copy[key].recentlyServed.push({
                        id: item.id,
                        queueNumber: item.queue_number,
                        name: item.customer_name,
                        counterNumber: counterId,
                        timestamp: new Date(item.served_at || ts),
                    });
                }
            });

            // Sort waiting and recentlyServed
            copy[key].waitingQueue.sort((a: any, b: any) => +new Date(a.timestamp) - +new Date(b.timestamp));
            copy[key].recentlyServed.sort((a: any, b: any) => +new Date(b.timestamp) - +new Date(a.timestamp));

            // if nothing is serving, mark first waiting as next (isNext)
            if (!copy[key].currentServing && copy[key].waitingQueue.length > 0) {
                copy[key].currentServing = { ...copy[key].waitingQueue[0], isNext: true };
            }

            return copy;
        });
    }, []);

    // --------------------------
    // Helper: transform an array of all queues (initial load)
    // --------------------------
    const processQueueData = useCallback((data: QueueItem[]) => {
        const organized: Record<string, CounterState> = {};

        data.forEach(item => {
            const cid = item.service_counter_id;
            const key = String(cid);
            if (!organized[key]) {
                organized[key] = {
                    currentServing: null,
                    waitingQueue: [],
                    recentlyServed: [],
                    counterInfo: item.counter || null,
                };
            }
            const ts = item.created_at || item.timestamp || new Date().toISOString();

            if (item.status === "serving") {
                organized[key].currentServing = {
                    id: item.id,
                    queueNumber: item.queue_number,
                    name: item.customer_name,
                    counterNumber: cid,
                    timestamp: new Date(ts),
                };
            } else if (item.status === "waiting") {
                organized[key].waitingQueue.push({
                    id: item.id,
                    queueNumber: item.queue_number,
                    name: item.customer_name,
                    counterNumber: cid,
                    timestamp: new Date(ts),
                });
            } else if (item.status === "completed") {
                organized[key].recentlyServed.push({
                    id: item.id,
                    queueNumber: item.queue_number,
                    name: item.customer_name,
                    counterNumber: cid,
                    timestamp: new Date(item.served_at || ts),
                });
            }
        });

        Object.values(organized).forEach(c => {
            c.waitingQueue.sort((a: any, b: any) => +new Date(a.timestamp) - +new Date(b.timestamp));
            c.recentlyServed.sort((a: any, b: any) => +new Date(b.timestamp) - +new Date(a.timestamp));
        });

        Object.entries(organized).forEach(([k, c]) => {
            if (!c.currentServing && c.waitingQueue.length > 0) {
                c.currentServing = { ...c.waitingQueue[0], isNext: true };
            }
        });

        setCounterData(organized);
    }, []);

    // --------------------------
    // Initial "one-time" loads
    // --------------------------
    useEffect(() => {
        isMounted.current = true;
        (async () => {
            try {
                const countersRes = await CounterService.fetchCounters();
                if (countersRes && countersRes.success) {
                    setAllCounters(countersRes.data);
                }
            } catch (err) {
                console.error("Error loading counters:", err);
            }

            // Initial queue load
            try {
                const q = await QueueService.listQueue(null);
                if (q && q.success) {
                    processQueueData(q.data);
                }
            } catch (err) {
                console.error("Initial queue load failed:", err);
            }
        })();

        return () => {
            isMounted.current = false;
        };
    }, [processQueueData]);

    // --------------------------
    // Real-time subscriptions (Pusher) - FIXED METHOD NAMES
    // --------------------------
    useEffect(() => {
        console.log("🔄 Setting up real-time subscriptions (QueueListUpdated primary)...");

        // Connect pusher
        socketService.connect();

        // Helper to push unsubscribe functions
        const addUnsub = (fn: () => void) => subs.current.push(fn);

        // 1) Subscribe to global QueueListUpdated
        const unsubGlobalList = QueueService.onQueueListUpdate((data: any) => {
            if (data && data.counter_id && Array.isArray(data.queues)) {
                console.log("📋 [global] QueueListUpdated received:", data.counter_id, data.queues.length);
                processQueueListUpdate(Number(data.counter_id), data.queues);
            } else {
                console.log("📋 [global] QueueListUpdated (unexpected payload):", data);
            }
        });
        if (typeof unsubGlobalList === "function") addUnsub(unsubGlobalList);

        // 2) Subscribe to QueueListUpdated per-counter
        const subscribePerCounter = (counters: any[]) => {
            counters
                .filter(c => c.status === "Active")
                .forEach(counter => {
                    // FIXED: Using correct method name from API service
                    const unsub = QueueService.onQueueListUpdateForCounter(counter.id, (data: any) => {
                        if (data && data.counter_id && Array.isArray(data.queues)) {
                            console.log(`📋 [counter ${counter.id}] QueueListUpdated received, items:`, data.queues.length);
                            processQueueListUpdate(Number(data.counter_id), data.queues);
                        } else {
                            console.log(`[counter ${counter.id}] QueueListUpdated unexpected payload:`, data);
                        }
                    });
                    if (typeof unsub === "function") addUnsub(unsub);
                });
            console.log("✅ Subscribed to per-counter QueueListUpdated (for active counters)");
        };

        if (allCounters.length > 0) {
            subscribePerCounter(allCounters);
        } else {
            // If counters not yet loaded, wait and subscribe when available
            const timer = setTimeout(async () => {
                try {
                    const countersRes = await CounterService.fetchCounters();
                    if (countersRes && countersRes.success) {
                        setAllCounters(countersRes.data);
                        subscribePerCounter(countersRes.data);
                    }
                } catch (err) {
                    console.error("Failed to fetch counters for subscription:", err);
                }
            }, 1000);
            addUnsub(() => clearTimeout(timer));
        }

        // 3) Subscribe to ServiceQueueUpdated as fallback - FIXED METHOD NAME
        const unsubServiceQueue = QueueService.onServiceQueueUpdate(null, (raw: any) => {
            console.log("📌 ServiceQueueUpdated (fallback) received:", raw);
            // We do NOT call full API here. QueueListUpdated should follow with authoritative list.
        });
        if (typeof unsubServiceQueue === "function") addUnsub(unsubServiceQueue);

        // 4) Subscribe to counter stats (QueueUpdated) - FIXED: Using correct method
        const unsubCounterStats = QueueService.onAllCountersUpdate((data: any) => {
            if (data && data.counter_id) {
                const key = String(data.counter_id);
                setCounterData(prev => {
                    const copy = { ...prev };
                    if (!copy[key]) {
                        copy[key] = { currentServing: null, waitingQueue: [], recentlyServed: [], counterInfo: null };
                    }
                    copy[key].counterInfo = {
                        ...(copy[key].counterInfo || {}),
                        id: data.counter_id,
                        counter_name: data.counter_name ?? copy[key].counterInfo?.counter_name,
                        queue_waiting: data.queue_waiting ?? copy[key].counterInfo?.queue_waiting,
                        queue_serving: data.queue_serving ?? copy[key].counterInfo?.queue_serving,
                    };
                    return copy;
                });
            }
        });
        if (typeof unsubCounterStats === "function") addUnsub(unsubCounterStats);

        // Cleanup
        return () => {
            console.log("🧹 Clearing real-time subscriptions...");
            subs.current.forEach(u => {
                try { u(); } catch (e) { /* ignore */ }
            });
            subs.current = [];
        };
    }, [processQueueListUpdate, allCounters]);

    // --------------------------
    // Clock effect
    // --------------------------
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // --------------------------
    // Derived UI lists
    // --------------------------
    const currentlyServing = Object.entries(counterData)
        .filter(([_, data]) => data.currentServing !== null && !data.currentServing.isNext)
        .map(([counterNum, data]) => ({
            counterNumber: Number(counterNum),
            counterName: data.counterInfo?.counter_name ?? `Counter ${counterNum}`,
            data,
        }));

    const nextToServe = Object.entries(counterData)
        .filter(([_, data]) => data.currentServing !== null && data.currentServing.isNext)
        .map(([counterNum, data]) => ({
            counterNumber: Number(counterNum),
            counterName: data.counterInfo?.counter_name ?? `Counter ${counterNum}`,
            data,
        }));

    const allRecentlyServed = Object.values(counterData)
        .flatMap((d: any) => d.recentlyServed ?? [])
        .sort((a: any, b: any) => +new Date(b.timestamp) - +new Date(a.timestamp))
        .slice(0, 5);

    const allWaitingCustomers = Object.entries(counterData)
        .flatMap(([counterNum, data]: [string, any]) =>
            (data.waitingQueue ?? []).slice(nextToServe.length > 0 ? 1 : 0).map((item: any, idx: number) => ({
                ...item,
                position: idx + (nextToServe.length > 0 ? 2 : 1),
                counterNumber: Number(counterNum),
                counterName: data.counterInfo?.counter_name ?? `Counter ${counterNum}`,
            }))
        )
        .sort((a, b) => a.position - b.position);

    const formatTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const formatDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // --------------------------
    // Render (complete UI with all sections)
    // --------------------------
    return (
        <div className={`min-h-[600px] overflow-hidden ${darkMode ? "bg-gray-900" : "bg-gradient-to-br from-blue-50 to-indigo-50"} shadow-xl`}>
            {/* HEADER */}
            <div className={`px-8 py-6 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white/80 border-gray-200 backdrop-blur-sm"} border-b flex justify-between items-center`}>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${currentlyServing.length > 0 ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                        <span className={`text-lg font-semibold ${darkMode ? "text-gray-200" : "text-gray-800"}`}>Queue Display System</span>
                    </div>

                    {/* Queue Stats */}
                    <div className="flex items-center gap-6 ml-6">
                        <div className="flex items-center gap-2">
                            <Users className={`h-4 w-4 ${darkMode ? "text-blue-400" : "text-blue-600"}`} />
                            <span className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{allWaitingCustomers.length + nextToServe.length} Waiting</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle className={`h-4 w-4 ${darkMode ? "text-green-400" : "text-green-600"}`} />
                            <span className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{allRecentlyServed.length} Served</span>
                        </div>
                    </div>
                </div>

                <div className="text-right">
                    <div className={`text-md font-mono font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>{formatTime(currentTime)}</div>
                    <div className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>{formatDate(currentTime)}</div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="p-8">
                {/* NOW SERVING - Large and Prominent */}
                {currentlyServing.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-center gap-4 mb-6">
                            <div className={`text-3xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>NOW SERVING</div>
                            <AnimatePresence>
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-2">
                                    <Volume2 className="size-5 text-green-500 animate-pulse" />
                                    <span className={`text-sm ${darkMode ? "text-green-400" : "text-green-600"}`}>Please proceed to counter</span>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {currentlyServing.map(({ counterNumber, counterName, data }) => (
                                <AnimatePresence key={counterNumber}>
                                    {data.currentServing && (
                                        <motion.div
                                            key={data.currentServing.id}
                                            initial={{ opacity: 0, y: 30, scale: 0.9 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                            className={`relative p-6 rounded-2xl ${darkMode ? "bg-gradient-to-br from-emerald-600 to-green-700 shadow-2xl" : "bg-gradient-to-br from-emerald-500 to-green-600 shadow-2xl"} text-white overflow-hidden`}
                                        >
                                            <div className="flex items-center justify-between mb-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-3 rounded-full bg-green-200 animate-pulse" />
                                                    <span className="text-white/90 font-semibold text-lg">{counterName}</span>
                                                </div>
                                                <div className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">Serving Now</div>
                                            </div>

                                            <div className="text-center mb-4">
                                                <div className="text-4xl font-bold tracking-wider mb-2">{data.currentServing.queueNumber}</div>
                                            </div>

                                            <div className="text-center mb-4">
                                                <div className="inline-block px-6 py-1 bg-white/20 rounded-lg backdrop-blur-sm">
                                                    <span className="text-xl font-semibold">{data.currentServing.name}</span>
                                                </div>
                                            </div>

                                            <div className="absolute bottom-4 right-4 flex items-center gap-1 text-white/70">
                                                <Clock className="h-4 w-4" />
                                                <span className="text-sm">Now</span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            ))}
                        </div>
                    </div>
                )}

                {/* NEXT TO SERVE - Compact and Secondary */}
                {nextToServe.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <div className={`text-2xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>NEXT TO SERVE</div>
                            <Loader className={`size-5 ${darkMode ? "text-orange-400" : "text-orange-500"} animate-pulse`} />
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${darkMode ? "bg-orange-900/50 text-orange-300" : "bg-orange-100 text-orange-700"}`}>
                                {nextToServe.length} counters
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {nextToServe.map(({ counterNumber, counterName, data }) => (
                                <motion.div
                                    key={counterNumber}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={`p-4 rounded-xl ${darkMode ? "bg-gray-800 border border-gray-700" : "bg-white border border-orange-400/30"} shadow-lg`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                            <span className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                                                {counterName}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-center">
                                        <div className={`text-2xl font-bold mb-1 ${darkMode ? "text-white" : "text-gray-900"}`}>
                                            {data.currentServing.queueNumber}
                                        </div>
                                        <div className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                                            {data.currentServing.name}
                                        </div>
                                    </div>

                                    <div className="text-center mt-2">
                                        <span className={`text-xs px-2 py-1 rounded-full ${darkMode ? "bg-orange-900/50 text-orange-300" : "bg-orange-100 text-orange-600"}`}>
                                            Ready when called
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* WAITING QUEUE */}
                {allWaitingCustomers.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <Users className={`h-6 w-6 ${darkMode ? "text-blue-400" : "text-blue-600"}`} />
                            <div className={`text-xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>WAITING QUEUE</div>
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${darkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                                {allWaitingCustomers.length} customers
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {allWaitingCustomers.slice(0, 12).map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={`p-3 rounded-lg ${darkMode ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"} shadow-sm`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                                            {item.queueNumber}
                                        </div>
                                        <div className={`px-1.5 py-0.5 rounded text-xs ${darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                                            #{item.position}
                                        </div>
                                    </div>

                                    <div className={`text-xs font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                                        {item.name}
                                    </div>

                                    <div className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
                                        Counter {item.counterNumber}
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {allWaitingCustomers.length > 12 && (
                            <div className="text-center mt-4">
                                <div className={`inline-block px-3 py-1 rounded-full text-sm ${darkMode ? "bg-gray-800 text-gray-400" : "bg-gray-200 text-gray-600"}`}>
                                    +{allWaitingCustomers.length - 12} more waiting
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* NO CUSTOMERS STATE */}
                {currentlyServing.length === 0 && nextToServe.length === 0 && allWaitingCustomers.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`p-16 rounded-3xl text-center ${darkMode ? "bg-gray-800 border-2 border-gray-700" : "bg-white/80 border-2 border-gray-200 backdrop-blur-sm"}`}
                    >
                        <Users className={`h-16 w-16 mx-auto mb-4 ${darkMode ? "text-gray-600" : "text-gray-400"}`} />
                        <div className={`text-2xl font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                            No customers in queue
                        </div>
                        <div className={`mt-2 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                            The queue is currently empty
                        </div>
                    </motion.div>
                )}

                {/* RECENTLY SERVED */}
                {allRecentlyServed.length > 0 && (
                    <div>
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <CheckCircle className={`h-6 w-6 ${darkMode ? "text-green-400" : "text-green-600"}`} />
                            <div className={`text-xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>RECENTLY SERVED</div>
                        </div>

                        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
                            {allRecentlyServed.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.1 }}
                                    className={`p-2 rounded-lg text-center ${darkMode ? "bg-gray-800 border border-gray-700" : "bg-white/80 border border-gray-200 backdrop-blur-sm"}`}
                                >
                                    <CheckCircle className={`h-4 w-4 mx-auto mb-1 ${darkMode ? "text-green-400" : "text-green-500"}`} />
                                    <div className={`font-bold text-sm ${darkMode ? "text-white" : "text-gray-900"}`}>
                                        {item.queueNumber}
                                    </div>
                                    <div className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                                        {item.name}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* FOOTER */}
            <div className={`px-8 py-4 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white/80 border-gray-200 backdrop-blur-sm"} border-t text-center`}>
                <div className={`font-semibold ${darkMode ? "text-gray-200" : "text-gray-800"}`}>Thank you for your patience</div>
            </div>

            {/* BOTTOM TICKER */}
            <div className="bg-blue-400 py-4 border-t-4 border-green-600">
                <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: "-100%" }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="text-xl font-bold whitespace-nowrap"
                >
                    {currentlyServing.length > 0
                        ? `🔊 ATTENTION: Please proceed to counter for numbers: ${currentlyServing.map(c => c.data.currentServing.queueNumber).join(', ')}`
                        : "🔊 Welcome! Please wait for your number to be called"
                    }
                </motion.div>
            </div>
        </div>
    );
};

export default Display;