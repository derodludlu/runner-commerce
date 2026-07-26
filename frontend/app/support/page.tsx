"use client";

import { useEffect, useState } from "react";
import { supportApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus, Send, Clock, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  messages?: Array<{
    id: string;
    message: string;
    createdAt: string;
    isInternal: boolean;
  }>;
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const { user } = useAuth();
  const router = useRouter();

  const [formData, setFormData] = useState({
    subject: "",
    description: "",
    priority: "MEDIUM" as const,
    category: "OTHER" as const,
    orderId: "",
  });

  useEffect(() => {
    if (!user) {
      router.push("/login?redirect=/support");
      return;
    }
    loadTickets();
  }, [user]);

  const loadTickets = async () => {
    try {
      const response = await supportApi.getTickets();
      setTickets(response.data || []);
    } catch (error) {
      toast.error("Failed to load tickets");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await supportApi.createTicket(formData);
      toast.success("Ticket created successfully");
      setShowCreateForm(false);
      setFormData({
        subject: "",
        description: "",
        priority: "MEDIUM",
        category: "OTHER",
        orderId: "",
      });
      loadTickets();
      setSelectedTicket(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to create ticket");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !newMessage.trim()) return;

    try {
      await supportApi.addMessage(selectedTicket.id, newMessage);
      toast.success("Message sent");
      setNewMessage("");
      // Reload ticket to see new message
      const response = await supportApi.getTicket(selectedTicket.id);
      setSelectedTicket(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN":
        return "bg-blue-100 text-blue-800";
      case "IN_PROGRESS":
        return "bg-yellow-100 text-yellow-800";
      case "RESOLVED":
        return "bg-green-100 text-green-800";
      case "CLOSED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "bg-red-100 text-red-800";
      case "HIGH":
        return "bg-orange-100 text-orange-800";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  if (selectedTicket) {
    return (
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => setSelectedTicket(null)}
          className="mb-4 text-primary hover:underline flex items-center gap-2"
        >
          ← Back to Tickets
        </button>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">{selectedTicket.subject}</h1>
              <p className="text-gray-600 mt-1">{selectedTicket.description}</p>
            </div>
            <div className="flex gap-2">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                  selectedTicket.status
                )}`}
              >
                {selectedTicket.status}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(
                  selectedTicket.priority
                )}`}
              >
                {selectedTicket.priority}
              </span>
            </div>
          </div>

          <div className="flex gap-4 text-sm text-gray-500">
            <span>Category: {selectedTicket.category}</span>
            <span>Created: {new Date(selectedTicket.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Messages</h2>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {selectedTicket.messages?.map((msg) => (
              <div
                key={msg.id}
                className={`p-4 rounded-lg ${
                  msg.isInternal ? "bg-gray-100" : "bg-blue-50"
                }`}
              >
                <p className="text-gray-800">{msg.message}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {new Date(msg.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* Send Message */}
          <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              type="submit"
              className="bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <MessageSquare className="w-8 h-8" />
          Support Tickets
        </h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreateTicket}
          className="bg-white rounded-lg shadow-md p-6 mb-8"
        >
          <h2 className="text-xl font-bold mb-4">Create Support Ticket</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Subject</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) =>
                  setFormData({ ...formData, subject: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Brief summary of your issue"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                rows={4}
                placeholder="Describe your issue in detail..."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: e.target.value as any,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: e.target.value as any,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="ORDER">Order</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="PRODUCT">Product</option>
                  <option value="TECHNICAL">Technical</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Order ID (optional)
              </label>
              <input
                type="text"
                value={formData.orderId}
                onChange={(e) =>
                  setFormData({ ...formData, orderId: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Related order ID"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Create Ticket
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <MessageSquare className="w-16 h-16 mx-auto text-gray-300 animate-pulse" />
          <p className="mt-4 text-gray-500">Loading tickets...</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <MessageSquare className="w-16 h-16 mx-auto text-gray-300" />
          <h2 className="mt-4 text-xl font-semibold text-gray-700">
            No support tickets
          </h2>
          <p className="mt-2 text-gray-500">
            Create a ticket if you need assistance.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{ticket.subject}</h3>
                  <p className="text-gray-600 mt-1 line-clamp-2">
                    {ticket.description}
                  </p>
                  <div className="flex gap-3 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </span>
                    <span>Category: {ticket.category}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                      ticket.status
                    )}`}
                  >
                    {ticket.status}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(
                      ticket.priority
                    )}`}
                  >
                    {ticket.priority}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
