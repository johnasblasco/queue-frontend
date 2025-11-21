// CounterManagement.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { logout, socketService } from '@/services/api'
interface Counter {
    id: number;
    name: string;
    prefix: string;
    isActive: boolean;
    queue_waiting?: number;
    queue_serving?: number;
}

interface Props {
    counters: Counter[];
    queues: Record<number, any[]>;
    onAddCounter: (name: string, prefix: string) => void;
    onEditCounter: (id: number, name: string, prefix: string) => void;
    onDeleteCounter: (id: number) => void;
    onToggleCounter: (id: number) => void;
}




export default function CounterManagement({
    counters,
    onAddCounter,
    onEditCounter,
    onDeleteCounter,
    onToggleCounter,
}: Props) {
    const [editing, setEditing] = useState<Counter | null>(null);
    const [name, setName] = useState("");
    const [prefix, setPrefix] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const navigate = useNavigate();


    const openAdd = () => {
        setEditing(null);
        setName("");
        setPrefix("");
        setIsDialogOpen(true);
    };

    const openEdit = (c: Counter) => {
        setEditing(c);
        setName(c.name);
        setPrefix(c.prefix);
        setIsDialogOpen(true);
    };

    const save = () => {
        if (!name.trim() || !prefix.trim()) {
            toast.error("Please fill in both fields");
            return;
        }

        if (prefix.length > 3) {
            toast.error("Prefix must be 3 characters or less");
            return;
        }

        if (editing) {
            onEditCounter(editing.id, name, prefix.toUpperCase());
        } else {
            onAddCounter(name, prefix.toUpperCase());
        }
        setIsDialogOpen(false);
    };



    const handleLogout = async () => {
        const res = await logout();

        socketService.disconnect();

        if (res.isSuccess) {
            toast.success(res.message);
            navigate("/")
        } else {
            toast.error(res.message);
        }


    }

    // Calculate totals for dashboard
    const totalCounters = counters.length;
    const activeCounters = counters.filter(c => c.isActive).length;
    const totalWaiting = counters.reduce((sum, c) => sum + (c.queue_waiting || 0), 0);
    const totalServing = counters.reduce((sum, c) => sum + (c.queue_serving || 0), 0);

    return (
        <>
            <div className="p-6 bg-white rounded-xl shadow-sm border border-blue-200 space-y-6">
                {/* Dashboard Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-2xl font-bold text-blue-900">{totalCounters}</div>
                        <div className="text-sm text-blue-700">Total Counters</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="text-2xl font-bold text-green-900">{activeCounters}</div>
                        <div className="text-sm text-green-700">Active Counters</div>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                        <div className="text-2xl font-bold text-orange-900">{totalWaiting}</div>
                        <div className="text-sm text-orange-700">Total Waiting</div>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="text-2xl font-bold text-purple-900">{totalServing}</div>
                        <div className="text-sm text-purple-700">Total Serving</div>
                    </div>
                </div>

                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Counter Management</h2>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openAdd}>
                        Add Counter
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {counters.map((c) => (
                        <div
                            key={c.id}
                            className="p-4 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow"
                        >
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-lg font-bold text-gray-900">{c.name}</h3>
                                <Badge
                                    variant={c.isActive ? "default" : "secondary"}
                                    className={c.isActive ? "bg-green-500" : "bg-gray-500"}
                                >
                                    {c.isActive ? "Active" : "Inactive"}
                                </Badge>
                            </div>

                            <div className="space-y-2">
                                <p className="text-sm text-gray-600">
                                    <span className="font-medium">Prefix:</span> {c.prefix}
                                </p>

                                <div className="flex justify-between text-sm">
                                    <span className="text-orange-600 font-medium">
                                        Waiting: {c.queue_waiting || 0}
                                    </span>
                                    <span className="text-green-600 font-medium">
                                        Serving: {c.queue_serving || 0}
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-4">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEdit(c)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onToggleCounter(c.id)}
                                    className={c.isActive ? "text-orange-600" : "text-green-600"}
                                >
                                    {c.isActive ? "Deactivate" : "Activate"}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    className="dark:bg-red-600"
                                    onClick={() => onDeleteCounter(c.id)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                {counters.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        No counters found. Create your first counter to get started.
                    </div>
                )}

                {/* Add/Edit Counter Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editing ? "Edit Counter" : "Add Counter"}</DialogTitle>
                            <DialogDescription>
                                {editing
                                    ? "Update counter details below."
                                    : "Create a new service counter with a unique prefix."
                                }
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="counter-name">Counter Name</Label>
                                <Input
                                    id="counter-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Counter 1"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="counter-prefix">Prefix</Label>
                                <Input
                                    id="counter-prefix"
                                    value={prefix}
                                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                                    placeholder="e.g., A"
                                    maxLength={3}
                                />
                                <p className="text-sm text-gray-500">
                                    Queue numbers will look like: <strong>{prefix || "X"}-001</strong>, <strong>{prefix || "X"}-002</strong>, etc.
                                </p>
                            </div>
                        </div>

                        <DialogFooter className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={save}>
                                {editing ? "Save Changes" : "Create Counter"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>


            </div>


            {/* LOGOUT */}
            <div className="flex justify-center mt-4">
                <Button
                    variant={"destructive"}
                    className="hover:cursor-pointer active:scale-90 w-64 px-4 py-7 dark:bg-red-600  font-semibold rounded-lg shadow-lg transition-colors duration-300"
                    onClick={handleLogout}
                >
                    Back to Controller
                </Button>
            </div>
        </>
    );
}