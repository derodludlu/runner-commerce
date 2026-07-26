"use client";

import { useEffect, useState } from "react";
import { notificationsApi } from "@/lib/api";
import {
  Bell,
  Mail,
  AlertCircle,
  CheckCircle,
  Package,
  DollarSign,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "ORDER" | "PAYMENT" | "PROMOTION" | "SYSTEM";
  channel: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    try {
      const [notifResponse, countResponse] = await Promise.all([
        notificationsApi.getNotifications(),
        notificationsApi.getUnreadCount(),
      ]);
      setNotifications(notifResponse.data || []);
      setUnreadCount(countResponse.data.unreadCount || 0);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationsApi.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, status: "DELIVERED" } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      toast.error("Failed to mark as read");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: "DELIVERED" })),
      );
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch (error) {
      toast.error("Failed to mark all as read");
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "ORDER":
        return <Package className="w-5 h-5 text-blue-500" />;
      case "PAYMENT":
        return <DollarSign className="w-5 h-5 text-green-500" />;
      case "PROMOTION":
        return <Tag className="w-5 h-5 text-purple-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "ORDER":
        return "bg-blue-50 border-blue-200";
      case "PAYMENT":
        return "bg-green-50 border-green-200";
      case "PROMOTION":
        return "bg-purple-50 border-purple-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <Bell className="w-16 h-16 mx-auto text-gray-300 animate-pulse" />
          <p className="mt-4 text-gray-500">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Bell className="w-8 h-8" />
          Notifications
          {unreadCount > 0 && (
            <span className="bg-primary text-white text-sm px-3 py-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="text-primary hover:underline font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Bell className="w-16 h-16 mx-auto text-gray-300" />
          <h2 className="mt-4 text-xl font-semibold text-gray-700">
            No notifications
          </h2>
          <p className="mt-2 text-gray-500">
            You're all caught up! Check back later for updates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white rounded-lg shadow-md p-4 border-l-4 ${
                notification.status === "PENDING"
                  ? "border-primary"
                  : "border-gray-300"
              } ${getNotificationColor(notification.type)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {notification.title}
                    </h3>
                    <p className="text-gray-600 mt-1">{notification.message}</p>
                    <p className="text-sm text-gray-500 mt-2">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {notification.status === "PENDING" && (
                  <button
                    onClick={() => handleMarkAsRead(notification.id)}
                    className="flex-shrink-0 text-primary hover:text-primary/80"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
