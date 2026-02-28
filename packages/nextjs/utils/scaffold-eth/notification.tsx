import React from "react";
import { Toast, ToastPosition, toast } from "react-hot-toast";
import { XMarkIcon } from "@heroicons/react/20/solid";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/solid";

type NotificationProps = {
  content: React.ReactNode;
  status: "success" | "info" | "loading" | "error" | "warning";
  duration?: number;
  icon?: string;
  position?: ToastPosition;
};

type NotificationOptions = {
  duration?: number;
  icon?: string;
  position?: ToastPosition;
};

const STATUS_STYLES = {
  success: { accent: "bg-emerald-400/80", border: "border-emerald-300/50" },
  loading: { accent: "bg-pg-violet/80", border: "border-pg-violet/40" },
  error: { accent: "bg-rose-400/80", border: "border-rose-300/50" },
  info: { accent: "bg-sky-400/80", border: "border-sky-300/50" },
  warning: { accent: "bg-amber-400/80", border: "border-amber-300/60" },
} as const;

const ENUM_STATUSES = {
  success: <CheckCircleIcon className="w-5 h-5 text-emerald-500" />,
  loading: (
    <span className="relative inline-flex h-5 w-5">
      <span className="absolute inset-0 rounded-full border-2 border-pg-violet/30" />
      <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-pg-violet animate-spin" />
    </span>
  ),
  error: <ExclamationCircleIcon className="w-5 h-5 text-rose-500" />,
  info: <InformationCircleIcon className="w-5 h-5 text-sky-500" />,
  warning: <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />,
};

const DEFAULT_DURATION = 3000;
const DEFAULT_POSITION: ToastPosition = "top-center";

/**
 * Custom Notification
 */
const Notification = ({
  content,
  status,
  duration = DEFAULT_DURATION,
  icon,
  position = DEFAULT_POSITION,
}: NotificationProps) => {
  return toast.custom(
    (t: Toast) => (
      <div
        className={`relative flex w-[min(92vw,34rem)] items-start gap-3 rounded-2xl border bg-base-100/95 px-4 py-3.5 shadow-[0_18px_45px_-24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all duration-300 ease-out ${
          STATUS_STYLES[status].border
        } ${
          position.substring(0, 3) === "top"
            ? `${t.visible ? "translate-y-0 opacity-100 scale-100" : "-translate-y-3 opacity-0 scale-95"}`
            : `${t.visible ? "translate-y-0 opacity-100 scale-100" : "translate-y-3 opacity-0 scale-95"}`
        }`}
      >
        <span className={`absolute inset-y-0 left-0 w-1.5 rounded-l-2xl ${STATUS_STYLES[status].accent}`} />
        <div className="pl-2 pt-0.5 leading-none shrink-0">
          {icon ? <span className="text-lg leading-none">{icon}</span> : ENUM_STATUSES[status]}
        </div>
        <div className="flex-1 min-w-0 overflow-x-hidden break-words whitespace-pre-line text-sm leading-snug text-base-content">
          {content}
        </div>

        <button
          type="button"
          className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-base-content/50 transition-colors hover:bg-base-200 hover:text-base-content"
          aria-label="Dismiss notification"
          onClick={() => toast.remove(t.id)}
        >
          <XMarkIcon className="w-4.5 h-4.5" />
        </button>
      </div>
    ),
    {
      duration: status === "loading" ? Infinity : duration,
      position,
    },
  );
};

export const notification = {
  success: (content: React.ReactNode, options?: NotificationOptions) => {
    return Notification({ content, status: "success", ...options });
  },
  info: (content: React.ReactNode, options?: NotificationOptions) => {
    return Notification({ content, status: "info", ...options });
  },
  warning: (content: React.ReactNode, options?: NotificationOptions) => {
    return Notification({ content, status: "warning", ...options });
  },
  error: (content: React.ReactNode, options?: NotificationOptions) => {
    return Notification({ content, status: "error", ...options });
  },
  loading: (content: React.ReactNode, options?: NotificationOptions) => {
    return Notification({ content, status: "loading", ...options });
  },
  remove: (toastId: string) => {
    toast.remove(toastId);
  },
};
