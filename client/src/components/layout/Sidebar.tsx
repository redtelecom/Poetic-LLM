import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Search, MoreHorizontal, Trash2, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Conversation } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
  className?: string;
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, className }: SidebarProps) {
  const [search, setSearch] = React.useState("");

  const filtered = conversations.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(id);
    }
  };

  return (
    <div className={cn("flex flex-col h-full border-r border-neutral-200 bg-neutral-50/50", className)}>
      <div className="p-4 flex flex-col gap-4">
        <Button 
          onClick={onNew} 
          className="w-full justify-start gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Reasoning Task
        </Button>
        
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input 
            placeholder="Search history..." 
            className="pl-9 bg-white border-neutral-200 focus-visible:ring-indigo-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="flex flex-col gap-1 pb-4">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-3 mb-2 mt-2">
            Recent
          </div>
          {filtered.map((conv) => (
            <div 
              key={conv.id}
              className={cn(
                "group flex items-center justify-between rounded-md p-2 text-sm transition-all hover:bg-neutral-200/50 cursor-pointer border border-transparent",
                activeId === conv.id ? "bg-white border-neutral-200 shadow-sm text-neutral-900 font-medium" : "text-neutral-600"
              )}
              onClick={() => onSelect(conv.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={cn(
                  "w-4 h-4 shrink-0",
                  activeId === conv.id ? "text-indigo-600" : "text-neutral-400"
                )} />
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate">{conv.title}</span>
                  <span className="text-[10px] text-neutral-400 font-normal truncate">
                    {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-neutral-600">
                    <MoreHorizontal className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 bg-white shadow-md border-neutral-200">
                  <DropdownMenuItem className="gap-2 text-xs">
                    <Edit2 className="w-3 h-3" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="gap-2 text-xs text-red-600 focus:text-red-700 focus:bg-red-50"
                    onClick={(e) => handleDelete(e, conv.id)}
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-8 text-sm text-neutral-400">
              No conversations found.
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="p-4 border-t border-neutral-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-inner">
            JD
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-neutral-900">John Doe</span>
            <span className="text-xs text-neutral-500">Pro Plan</span>
          </div>
        </div>
      </div>
    </div>
  );
}
