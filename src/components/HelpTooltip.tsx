"use client";

import { useState } from "react";
import { HelpCircle, X, Info } from "lucide-react";

interface HelpTooltipProps {
  content: string | React.ReactNode;
  title?: string;
}

export function HelpTooltip({ content, title }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group inline-flex items-center justify-center rounded-full bg-blue-500/10 p-1.5 text-blue-600 transition-all hover:bg-blue-500/20 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30"
        aria-label="Help"
        aria-expanded={isOpen}
      >
        <HelpCircle className="h-4 w-4 transition-transform group-hover:scale-110" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Popup */}
          <div className="absolute right-0 top-8 z-50 w-96 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 rounded-lg border border-blue-200/50 bg-white p-5 shadow-xl dark:border-blue-800/50 dark:bg-zinc-900">
            {/* Header with icon */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                {title && (
                  <h4 className="font-semibold text-foreground leading-tight">{title}</h4>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="text-sm leading-relaxed text-muted-foreground">
              {typeof content === "string" ? (
                <p className="text-muted-foreground">{content}</p>
              ) : (
                <div className="text-muted-foreground">{content}</div>
              )}
            </div>

            {/* Arrow pointer */}
            <div className="absolute -top-2 right-4 h-4 w-4 rotate-45 border-l border-t border-blue-200/50 bg-white dark:border-blue-800/50 dark:bg-zinc-900" />
          </div>
        </>
      )}
    </div>
  );
}

