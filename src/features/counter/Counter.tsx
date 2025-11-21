// CounterManagementPage.tsx
import { useEffect, useState } from "react";
import CounterManagement from "./CounterManagement";
import { CounterService, socketService } from "@/services/api";

import { toast } from "sonner";

interface Counter {
    id: number;
    name: string;
    prefix: string;
    isActive: boolean;
    queue_waiting?: number;
    queue_serving?: number;
}

export default function CounterManagementPage() {
    const [counters, setCounters] = useState<Counter[]>([]);
    const [queues, setQueues] = useState<Record<number, any[]>>({});

    useEffect(() => {
        loadCounters();

        // Listen for real-time counter updates
        const unsubscribe = CounterService.onCounterUpdate(handleCounterUpdate);

        // Connect to WebSocket
        socketService.connect();

        return () => {
            unsubscribe();
            socketService.disconnect();
        };
    }, []);

    // Handle real-time counter updates
    const handleCounterUpdate = (data: any) => {
        console.log("🔄 Real-time counter update:", data);

        // Update counters state with new data
        setCounters(prevCounters =>
            prevCounters.map(counter =>
                counter.id === data.counter_id
                    ? {
                        ...counter,
                        queue_waiting: data.queue_waiting,
                        queue_serving: data.queue_serving
                    }
                    : counter
            )
        );

        // Update queues state
        setQueues(prevQueues => ({
            ...prevQueues,
            [data.counter_id]: [
                ...Array(data.queue_waiting || 0).fill({ status: "waiting" }),
                ...Array(data.queue_serving || 0).fill({ status: "serving" }),
            ]
        }));
    };

    const loadCounters = async () => {
        try {
            const res = await CounterService.fetchCounters();

            if (res.success) {
                const formatted = res.data.map((c: any) => ({
                    id: c.id,
                    name: c.counter_name,
                    prefix: c.prefix,
                    isActive: c.status === "Active",
                    queue_waiting: c.queue_waiting,
                    queue_serving: c.queue_serving,
                }));

                setCounters(formatted);

                // Update queues from counter data
                const stats: Record<number, any[]> = {};
                res.data.forEach((c: any) => {
                    stats[c.id] = [
                        ...Array(c.queue_waiting || 0).fill({ status: "waiting" }),
                        ...Array(c.queue_serving || 0).fill({ status: "serving" }),
                    ];
                });

                setQueues(stats);
            } else {
                toast.error(res.message || "Failed to load counters");
            }
        } catch (error) {
            console.error("Load counters error:", error);
            toast.error("Failed to load counters");
        }
    };

    const handleAdd = async (name: string, prefix: string) => {
        try {
            const res = await CounterService.createCounter({ counter_name: name, prefix });
            if (res.success) {
                toast.success("Counter created successfully!");
                loadCounters(); // Reload to get the new counter with ID
            } else {
                toast.error(res.message || "Error creating counter");
            }
        } catch (error: any) {
            console.error("Add counter error:", error);
            toast.error(error.response?.data?.message || "Error creating counter");
        }
    };

    const handleEdit = async (id: number, name: string, prefix: string) => {
        try {
            const res = await CounterService.updateCounter(id, { counter_name: name, prefix });
            if (res.success) {
                toast.success("Counter updated successfully!");
                // No need to reload - WebSocket will update in real-time
            } else {
                toast.error(res.message || "Update failed");
            }
        } catch (error: any) {
            console.error("Edit counter error:", error);
            toast.error(error.response?.data?.message || "Update failed");
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const res = await CounterService.deleteCounter(id);
            if (res.success) {
                toast.success("Counter deleted successfully!");
                // Remove from local state immediately
                setCounters(prev => prev.filter(c => c.id !== id));
                setQueues(prev => {
                    const newQueues = { ...prev };
                    delete newQueues[id];
                    return newQueues;
                });
            } else {
                toast.error(res.message || "Delete failed");
            }
        } catch (error: any) {
            console.error("Delete counter error:", error);
            toast.error(error.response?.data?.message || "Delete failed");
        }
    };

    const handleToggle = async (id: number) => {
        try {
            const counter = counters.find((x) => x.id === id);
            if (!counter) return;

            const newStatus = counter.isActive ? "Inactive" : "Active";
            const res = await CounterService.toggleCounter(id, newStatus);

            if (res.success) {
                toast.success(`Counter is now ${newStatus}`);
                // Update local state immediately
                setCounters(prev =>
                    prev.map(c =>
                        c.id === id ? { ...c, isActive: !c.isActive } : c
                    )
                );
            } else {
                toast.error(res.message || "Action failed");
            }
        } catch (error: any) {
            console.error("Toggle counter error:", error);
            toast.error(error.response?.data?.message || "Action failed");
        }
    };

    return (
        <div className="p-6">
            <CounterManagement
                counters={counters}
                queues={queues}
                onAddCounter={handleAdd}
                onEditCounter={handleEdit}
                onDeleteCounter={handleDelete}
                onToggleCounter={handleToggle}
            />
        </div>
    );
}