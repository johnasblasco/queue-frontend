import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PhoneCall, RotateCcw, SkipForward, Users, CheckCircle2, Clock, UserPlus, Trash2, Edit2, Check, X, Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import LoginModal from "./LoginModal";
import { Checkbox } from "@/components/ui/checkbox"

interface QueueItem {
    id: string;
    queueNumber: string;
    name: string;
    status: 'waiting' | 'serving' | 'completed';
    timestamp: Date;
}

interface Counter {
    id: number;
    name: string;
    isActive: boolean;
}

interface ControllerDashboardProps {
    queue: QueueItem[];
    currentServing: QueueItem | null;
    counterNumber: number;
    totalServedToday: number;
    counters: Counter[];
    onCallNext: () => void;
    onRecall: () => void;
    onSkip: (id: string) => void;
    onCounterChange: (counter: number) => void;
    onAddPerson: (name: string, isPriority?: boolean) => void;
    onRemove: (id: string) => void;
    onComplete: (id: string) => void;
    onEditName: (id: string, newName: string) => void;
    onClearCompleted: () => void;
}

export function ControllerDashboard({
    queue,
    currentServing,
    counterNumber,
    totalServedToday,
    counters,
    onCallNext,
    onRecall,
    onSkip,
    onCounterChange,
    onAddPerson,
    onRemove,
    onComplete,
    onEditName,
    onClearCompleted,
}: ControllerDashboardProps) {
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newPersonName, setNewPersonName] = useState("");
    const [, setSelectedCounter] = useState(counterNumber);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [isPriority, setIsPriority] = useState(false);
    const [, setCustomQueueNumber] = useState("");
    const [lastAddedTicket, setLastAddedTicket] = useState<{ queueNumber: string; name: string; isPriority: boolean } | null>(null);

    // Speech synthesis
    const speechSynth = useRef<SpeechSynthesisUtterance | null>(null);
    const isSpeaking = useRef(false);

    const waitingCount = queue.filter(q => q.status === "waiting").length;
    const completedCount = queue.filter(q => q.status === "completed").length;

    // Initialize speech synthesis
    useEffect(() => {
        if ('speechSynthesis' in window) {
            speechSynth.current = new SpeechSynthesisUtterance();
            speechSynth.current.rate = 0.9;
            speechSynth.current.pitch = 1;
            speechSynth.current.volume = 1;

            speechSynth.current.onend = () => {
                isSpeaking.current = false;
            };

            speechSynth.current.onerror = () => {
                isSpeaking.current = false;
            };
        }
    }, []);

    const speak = (text: string) => {
        if (!speechSynth.current || isSpeaking.current) return;

        try {
            isSpeaking.current = true;
            speechSynth.current.text = text;
            window.speechSynthesis.speak(speechSynth.current);
        } catch (error) {
            console.error('Speech synthesis error:', error);
            isSpeaking.current = false;
        }
    };

    const handleCallNext = () => {

        // If someone is currently being served, mark them completed first
        if (currentServing) {
            onComplete(currentServing.id);
        }


        onCallNext();

        // Find the next person to serve (first waiting person)
        const nextPerson = queue.find(q => q.status === 'waiting');
        if (nextPerson) {
            const announcement = `Hey Daddy! Counter ${counterNumber} is now serving ${nextPerson.name}, queue number ${nextPerson.queueNumber}. Please proceed to counter ${counterNumber}.`;
            speak(announcement);
        }
    };

    const handleRecall = () => {
        onRecall();

        if (currentServing) {
            const announcement = `Hey Daddy! Counter ${counterNumber} recalling ${currentServing.name}, queue number ${currentServing.queueNumber}. Please proceed to counter ${counterNumber}.`;
            speak(announcement);
        }
    };

    const printTicket = (queueNumber: string, name: string, isPriority: boolean) => {
        // Create a printable ticket element
        const printWindow = window.open('', '_blank', 'width=300,height=400');
        if (!printWindow) {
            alert('Please allow popups to print tickets');
            return;
        }

        const ticketContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Queue Ticket</title>
                <style>
                    @media print {
                        @page {
                            margin: 0;
                            size: 80mm 150mm;
                        }
                        body {
                            margin: 0;
                            padding: 8px;
                            font-family: 'Courier New', monospace;
                            font-size: 14px;
                            width: 80mm;
                        }
                    }
                    body {
                        margin: 0;
                        padding: 8px;
                        font-family: 'Courier New', monospace;
                        font-size: 14px;
                        width: 80mm;
                        border: 2px solid #000;
                    }
                    .ticket {
                        text-align: center;
                        padding: 10px 5px;
                    }
                    .header {
                        border-bottom: 2px dashed #000;
                        padding-bottom: 10px;
                        margin-bottom: 10px;
                    }
                    .company-name {
                        font-size: 18px;
                        font-weight: bold;
                        margin-bottom: 5px;
                    }
                    .queue-name {
                        font-size: 32px;
                        font-weight: bold;
                        margin: 10px 0;
                        color: #000;
                    }
                    .priority-badge {
                        background: #ff6b6b;
                        color: white;
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-size: 12px;
                        margin: 5px 0;
                        display: inline-block;
                    }
                    .info {
                        margin: 8px 0;
                        text-align: left;
                        padding: 0 10px;
                    }
                    .info-row {
                        display: flex;
                        justify-content: space-between;
                        margin: 4px 0;
                    }
                    .footer {
                        border-top: 2px dashed #000;
                        margin-top: 15px;
                        padding-top: 10px;
                        font-size: 12px;
                    }
                    .barcode {
                        margin: 10px 0;
                        font-family: 'Libre Barcode 128', cursive;
                        font-size: 36px;
                    }
                    .thank-you {
                        margin-top: 15px;
                        font-weight: bold;
                    }
                </style>
                <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap" rel="stylesheet">
            </head>
            <body>
                <div class="ticket">
                    <div class="header">
                        <div class="company-name">SERVICE CENTER</div>
                        <div>Queue Ticket</div>
                    </div>
                    
                    <div class="queue-name">${name}</div>
                    ${isPriority ? '<div class="priority-badge">PRIORITY</div>' : ''}
                    
                    <div class="info">
                        <div class="info-row">
                            <span>Queue Number:</span>
                            <span><strong>${queueNumber}</strong></span>
                        </div>
                        <div class="info-row">
                            <span>Date:</span>
                            <span>${new Date().toLocaleDateString()}</span>
                        </div>
                        <div class="info-row">
                            <span>Time:</span>
                            <span>${new Date().toLocaleTimeString()}</span>
                        </div>
                        <div class="info-row">
                            <span>Waiting:</span>
                            <span>${waitingCount + 1} ahead</span>
                        </div>
                    </div>
                    
                    <div class="barcode">*${queueNumber}*</div>
                    
                    <div class="footer">
                        <div>Please wait for your number</div>
                        <div>to be called</div>
                        <div class="thank-you">Thank you for waiting!</div>
                        <div style="margin-top: 5px; font-size: 10px;">
                            ${new Date().toLocaleString()}
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(ticketContent);
        printWindow.document.close();

        // Wait for content to load then print
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newPersonName.trim()) {
            // Generate queue number before adding
            const newQueueNumber = getNextQueueNumber();

            // Store ticket info for printing
            const ticketInfo = {
                queueNumber: newQueueNumber,
                name: newPersonName.trim(),
                isPriority: isPriority
            };

            // Add person to queue
            onAddPerson(
                newPersonName.trim(),
                isPriority
            );

            // Set last added ticket for printing
            setLastAddedTicket(ticketInfo);

            // Reset form
            setNewPersonName("");
            setCustomQueueNumber("");
            setIsPriority(false);
            setIsDialogOpen(false);
        }
    };

    // Print ticket when lastAddedTicket changes
    useEffect(() => {
        if (lastAddedTicket) {
            printTicket(lastAddedTicket.queueNumber, lastAddedTicket.name, lastAddedTicket.isPriority);
            setLastAddedTicket(null); // Reset after printing
        }
    }, [lastAddedTicket]);

    // Reset form when dialog opens
    const handleDialogOpenChange = (open: boolean) => {
        if (open) {
            setSelectedCounter(counterNumber);
            setNewPersonName("");
            setCustomQueueNumber("");
            setIsPriority(false);
        }
        setIsDialogOpen(open);
    };

    const startEditing = (id: string, currentName: string) => {
        setEditingId(id);
        setEditingName(currentName);
    };

    const saveEdit = (id: string) => {
        if (editingName.trim()) {
            onEditName(id, editingName.trim());
            setEditingId(null);
            setEditingName("");
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingName("");
    };

    // Generate next queue number
    const getNextQueueNumber = () => {
        const waitingNumbers = queue
            .filter(q => q.status === 'waiting')
            .map(q => {
                const num = parseInt(q.queueNumber.replace('P', ''));
                return isNaN(num) ? 0 : num;
            });

        const maxNumber = waitingNumbers.length > 0 ? Math.max(...waitingNumbers) : 0;
        return `P${maxNumber + 1}`;
    };

    return (
        <div className="space-y-6">
            {/* Stats and Controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>Counter Number</CardTitle>
                        <Users className="h-4 w-4 text-gray-500" />
                    </CardHeader>
                    <CardContent>
                        <Select
                            value={counterNumber.toString()}
                            onValueChange={(value: string) => onCounterChange(parseInt(value))}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {counters.filter(c => c.isActive).map((counter) => (
                                    <SelectItem key={counter.id} value={counter.id.toString()}>
                                        {counter.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>Waiting</CardTitle>
                        <Clock className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-gray-900 dark:text-white">{waitingCount}</div>
                        <p className="text-gray-600 dark:text-gray-400">In queue</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>Completed</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-gray-900 dark:text-white">{completedCount}</div>
                        <p className="text-gray-600 dark:text-gray-400">In history</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>Served Today</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-gray-900 dark:text-white">{totalServedToday}</div>
                        <p className="text-gray-600 dark:text-gray-400">Total</p>
                    </CardContent>
                </Card>
            </div>

            {/* Current Serving */}
            <Card>
                <CardHeader>
                    <CardTitle>Currently Serving</CardTitle>
                    <CardDescription>Active customer at this counter</CardDescription>
                </CardHeader>
                <CardContent>
                    {currentServing ? (
                        <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-4">
                                <Badge className="bg-blue-600 text-white px-4 py-2">
                                    {currentServing.queueNumber}
                                </Badge>
                                <div>
                                    <p className="text-gray-900 dark:text-white">{currentServing.name}</p>
                                    <p className="text-gray-600 dark:text-gray-400">Counter {counterNumber}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            No customer currently being served
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
                <Button
                    onClick={handleCallNext}
                    disabled={waitingCount === 0}
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 flex-1 min-w-[200px]"
                >
                    <PhoneCall className="mr-2 h-5 w-5" />
                    Call Next
                </Button>
                <Button
                    onClick={handleRecall}
                    disabled={!currentServing}
                    variant="outline"
                    size="lg"
                    className="flex-1 min-w-[150px]"
                >
                    <RotateCcw className="mr-2 h-5 w-5" />
                    Recall
                </Button>
                {completedCount > 0 && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="outline"
                                size="lg"
                                className="min-w-[150px]"
                            >
                                <Trash2 className="mr-2 h-5 w-5" />
                                Clear Completed
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Clear completed items?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will remove {completedCount} completed item{completedCount > 1 ? 's' : ''} from the queue. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={onClearCompleted}>
                                    Clear
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>

            {/* Queue Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Queue List</CardTitle>
                            <CardDescription>Manage people in the queue</CardDescription>
                        </div>
                        <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
                            <DialogTrigger asChild>
                                <Button className="bg-blue-600 hover:bg-blue-700">
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Add Person
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Person to Queue</DialogTitle>
                                    <DialogDescription>
                                        Enter the person's name and select options for the queue. A ticket will be automatically printed.
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleSubmit}>
                                    <div className="grid gap-4 py-4">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="priority"
                                                checked={isPriority}
                                                onCheckedChange={(checked: boolean) => setIsPriority(checked)}
                                            />
                                            <Label htmlFor="priority" className="cursor-pointer">
                                                Priority Customer
                                            </Label>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="name">Full Name *</Label>
                                            <Input
                                                id="name"
                                                placeholder="e.g., John Smith"
                                                value={newPersonName}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPersonName(e.target.value)}
                                                required
                                                autoFocus
                                            />
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                Next queue number: <strong>{getNextQueueNumber()}</strong>
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                A thermal ticket will be printed automatically
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setIsDialogOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button type="submit" disabled={!newPersonName.trim()}>
                                            <Printer className="mr-2 h-4 w-4" />
                                            Add & Print Ticket
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Queue #</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Time</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {queue.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400">
                                        No people in queue. Add someone to get started.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                queue.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    item.status === "serving"
                                                        ? "default"
                                                        : item.status === "completed"
                                                            ? "secondary"
                                                            : "outline"
                                                }
                                                className={
                                                    item.status === "serving"
                                                        ? "bg-blue-600 text-white"
                                                        : item.status === "completed"
                                                            ? "bg-green-600 text-white"
                                                            : ""
                                                }
                                            >
                                                {item.queueNumber}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {editingId === item.id ? (
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        value={editingName}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingName(e.target.value)}
                                                        className="h-8"
                                                        autoFocus
                                                        onKeyDown={(e: React.KeyboardEvent) => {
                                                            if (e.key === "Enter") {
                                                                saveEdit(item.id);
                                                            } else if (e.key === "Escape") {
                                                                cancelEdit();
                                                            }
                                                        }}
                                                    />
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => saveEdit(item.id)}
                                                    >
                                                        <Check className="h-4 w-4 text-green-600" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={cancelEdit}
                                                    >
                                                        <X className="h-4 w-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-gray-900 dark:text-white">{item.name}</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    item.status === "serving"
                                                        ? "default"
                                                        : item.status === "completed"
                                                            ? "secondary"
                                                            : "outline"
                                                }
                                                className={
                                                    item.status === "serving"
                                                        ? "bg-blue-500"
                                                        : item.status === "completed"
                                                            ? "bg-green-500"
                                                            : ""
                                                }
                                            >
                                                {item.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-gray-600 dark:text-gray-400">
                                            {item.timestamp.toLocaleTimeString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {item.status === "serving" && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => onComplete(item.id)}
                                                            title="Mark as completed"
                                                            className="text-green-600 hover:text-green-700"
                                                        >
                                                            <CheckCircle2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => startEditing(item.id, item.name)}
                                                            title="Edit name"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    title="Remove from queue"
                                                                    className="text-red-600 hover:text-red-700"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Remove from queue?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        This will permanently remove {item.name} ({item.queueNumber}) from the queue.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => onRemove(item.id)}>
                                                                        Remove
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </>
                                                )}
                                                {item.status === "waiting" && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => startEditing(item.id, item.name)}
                                                            title="Edit name"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => onSkip(item.id)}
                                                            title="Move to end"
                                                        >
                                                            <SkipForward className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => onComplete(item.id)}
                                                            title="Mark as completed"
                                                            className="text-green-600 hover:text-green-700"
                                                        >
                                                            <CheckCircle2 className="h-4 w-4" />
                                                        </Button>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    title="Remove from queue"
                                                                    className="text-red-600 hover:text-red-700"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Remove from queue?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        This will permanently remove {item.name} ({item.queueNumber}) from the queue.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => onRemove(item.id)}>
                                                                        Remove
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </>
                                                )}
                                                {item.status === "completed" && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                title="Remove from queue"
                                                                className="text-red-600 hover:text-red-700"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Remove from queue?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This will permanently remove {item.name} ({item.queueNumber}) from the queue.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => onRemove(item.id)}>
                                                                    Remove
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="flex justify-center mt-4">
                <button
                    className="hover:cursor-pointer hover:scale-95 active:scale-90 w-64 p-4 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 transition-colors duration-300"
                    onClick={() => setIsLoginOpen(true)}
                >
                    Manage Counter
                </button>
            </div>

            {/* Login Modal */}
            <LoginModal
                isOpen={isLoginOpen}
                onClose={() => setIsLoginOpen(false)}
                onLogin={(data: any) => {
                    console.log("Logging in with", data);
                    // You can add your authentication logic here
                    setIsLoginOpen(false);
                }}
            />
        </div>
    );
}