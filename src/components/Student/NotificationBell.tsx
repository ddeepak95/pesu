"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  StudentNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/queries/notifications";
import { useStudentNotifications } from "@/hooks/swr";

interface NotificationBellProps {
  studentId: string;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell({ studentId }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const notificationsQuery = useStudentNotifications(studentId);
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const handleClick = async (notification: StudentNotification) => {
    setOpen(false);
    if (!notification.read_at) {
      // Optimistic update via SWR cache.
      notificationsQuery.mutate(
        (current) =>
          (current ?? []).map((n) =>
            n.id === notification.id
              ? { ...n, read_at: new Date().toISOString() }
              : n
          ),
        false
      );
      await markNotificationAsRead(notification.id);
      notificationsQuery.mutate();
    }
    router.push(notification.data.nav_path);
  };

  const handleMarkAllRead = async () => {
    notificationsQuery.mutate(
      (current) =>
        (current ?? []).map((n) => ({
          ...n,
          read_at: n.read_at ?? new Date().toISOString(),
        })),
      false
    );
    await markAllNotificationsAsRead(studentId);
    notificationsQuery.mutate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  )}
                  <div className={!n.read_at ? "" : "pl-4"}>
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {n.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {n.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
