'use client';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppNotification {
  id: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    // TODO: Will be connected to the backend to fetch notifications for the logged-in user
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative p-2 rounded-md hover:bg-slate-800/80 cursor-pointer outline-none transition-colors">
        <Bell className="h-5 w-5 text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 border-2 border-[#0b0e14]" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 border-slate-800 bg-[#12161f] text-slate-200">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-slate-300">Bildirimler</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-800" />
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Yeni bildiriminiz yok.
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="flex flex-col items-start p-3 cursor-pointer focus:bg-slate-800 focus:text-slate-100">
                <span className={`text-sm ${notification.is_read ? 'text-slate-500' : 'text-slate-200 font-semibold'}`}>
                  {notification.message}
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  {new Date(notification.created_at).toLocaleDateString('tr-TR')}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}