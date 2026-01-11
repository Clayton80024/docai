"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Sparkles,
  Plus,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  Files,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useState, useEffect } from "react";

const navigation = [
  { 
    name: "Dashboard", 
    href: "/dashboard", 
    icon: LayoutDashboard,
  },
  { 
    name: "Aplicações", 
    href: "/applications", 
    icon: FileText,
  },
  { 
    name: "Todos os Arquivos", 
    href: "/files", 
    icon: Files,
  },
];

const quickActions = [
  { 
    name: "Nova Aplicação", 
    href: "/applications/new", 
    icon: Plus,
  },
  { 
    name: "Documentos IA", 
    href: "/dashboard", 
    icon: Sparkles,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Persist collapsed state in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved !== null) {
      setIsCollapsed(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", JSON.stringify(isCollapsed));
    // Update body class for layout adjustment
    if (isCollapsed) {
      document.body.classList.add("sidebar-collapsed");
    } else {
      document.body.classList.remove("sidebar-collapsed");
    }
  }, [isCollapsed]);

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    // For applications, only highlight if we're on the main applications page
    if (href === "/applications") {
      return pathname === "/applications" || pathname?.startsWith("/applications/new");
    }
    return pathname?.startsWith(href);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md transition-all hover:shadow-lg hover:scale-105"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5 text-gray-900 dark:text-gray-100" />
          ) : (
            <Menu className="h-5 w-5 text-gray-900 dark:text-gray-100" />
          )}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          transform transition-all duration-300 ease-in-out
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
          shadow-lg
          ${isCollapsed ? "w-20" : "w-64"}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo and Toggle Button */}
          <div className={`
            flex items-center border-b border-gray-200 dark:border-gray-800 transition-all duration-300
            ${isCollapsed ? "justify-center px-4 py-6" : "gap-3 px-6 py-6"}
          `}>
            {!isCollapsed && (
              <>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 dark:from-white dark:to-gray-100 shadow-lg transition-all duration-300 hover:scale-105">
                  <FileText className="h-6 w-6 text-white dark:text-gray-900 transition-transform" />
                </div>
                <div className="flex-1">
                  <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                    Installo
                  </h1>
                </div>
              </>
            )}
            {/* Toggle Button */}
            <button
              onClick={toggleCollapse}
              className={`
                hidden lg:flex items-center justify-center p-2 rounded-lg 
                text-gray-500 dark:text-gray-400 
                hover:bg-gray-100 dark:hover:bg-gray-800 
                transition-all duration-200 hover:scale-110
                ${isCollapsed ? "mx-auto" : ""}
              `}
              title={isCollapsed ? "Expandir menu" : "Minimizar menu"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const isHovered = hoveredItem === item.href;
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  onMouseEnter={() => setHoveredItem(item.href)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`
                    group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200
                    ${isCollapsed ? "justify-center px-3 py-3" : "gap-3 px-4 py-3"}
                    ${
                      active
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }
                  `}
                  title={isCollapsed ? item.name : ""}
                >
                  {/* Active indicator */}
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 dark:bg-blue-400 rounded-r-full" />
                  )}
                  
                  {/* Icon container */}
                  <div className={`
                    flex items-center justify-center rounded-lg transition-all duration-200
                    ${isCollapsed ? "h-9 w-9" : "h-9 w-9"}
                    ${
                      active
                        ? "bg-blue-100 dark:bg-blue-800/30"
                        : isHovered
                        ? "bg-gray-200 dark:bg-gray-700"
                        : "bg-transparent"
                    }
                  `}>
                    <Icon className={`
                      transition-all duration-200
                      ${isCollapsed ? "h-5 w-5" : "h-5 w-5"}
                      ${active 
                        ? "text-blue-700 dark:text-blue-400" 
                        : "text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100"
                      }
                    `} />
                  </div>
                  
                  {!isCollapsed && (
                    <>
                      <span className="flex-1">{item.name}</span>
                      {/* Chevron indicator */}
                      {isHovered && !active && (
                        <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500 transition-all duration-200" />
                      )}
                    </>
                  )}

                  {/* Tooltip for collapsed state */}
                  {isCollapsed && isHovered && (
                    <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-nowrap">
                      {item.name}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 dark:bg-gray-800 rotate-45" />
                    </div>
                  )}
                </Link>
              );
            })}

            {/* Divider */}
            {!isCollapsed && (
              <div className="my-4 border-t border-gray-200 dark:border-gray-800" />
            )}

            {/* Quick Actions Header */}
            {!isCollapsed && (
              <div className="px-4 py-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Ações Rápidas
                </p>
              </div>
            )}
            <div className="space-y-1">
              {quickActions.map((action) => {
                const Icon = action.icon;
                const active = isActive(action.href);
                const isHovered = hoveredItem === action.href;
                
                return (
                  <Link
                    key={action.name}
                    href={action.href}
                    onClick={() => setMobileMenuOpen(false)}
                    onMouseEnter={() => setHoveredItem(action.href)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`
                      group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200
                      ${isCollapsed ? "justify-center px-3 py-2.5" : "gap-3 px-4 py-2.5"}
                      ${
                        active
                          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }
                    `}
                    title={isCollapsed ? action.name : ""}
                  >
                    {/* Active indicator */}
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 dark:bg-blue-400 rounded-r-full" />
                    )}
                    
                    {/* Icon container */}
                    <div className={`
                      flex items-center justify-center rounded-lg transition-all duration-200
                      ${isCollapsed ? "h-8 w-8" : "h-8 w-8"}
                      ${
                        active
                          ? "bg-blue-100 dark:bg-blue-800/30"
                          : isHovered
                          ? "bg-gray-200 dark:bg-gray-700"
                          : "bg-transparent"
                      }
                    `}>
                      <Icon className={`
                        transition-all duration-200
                        ${isCollapsed ? "h-4 w-4" : "h-4 w-4"}
                        ${active 
                          ? "text-blue-700 dark:text-blue-400" 
                          : "text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100"
                        }
                      `} />
                    </div>
                    
                    {!isCollapsed && (
                      <>
                        <span className="flex-1">{action.name}</span>
                        {/* Chevron indicator */}
                        {isHovered && !active && (
                          <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500 transition-all duration-200" />
                        )}
                      </>
                    )}

                    {/* Tooltip for collapsed state */}
                    {isCollapsed && isHovered && (
                      <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-nowrap">
                        {action.name}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 dark:bg-gray-800 rotate-45" />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User section */}
          <div className={`
            px-4 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50
            ${isCollapsed ? "px-2" : ""}
          `}>
            <div className={`
              flex items-center rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all
              ${isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3"}
            `}>
              <div className="flex-shrink-0">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-10 w-10",
                    },
                  }}
                />
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    Conta
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    Configurações
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
