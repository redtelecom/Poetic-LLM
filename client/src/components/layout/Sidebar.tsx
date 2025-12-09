import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Search, Trash2, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Conversation } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  className?: string;
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, onRename, className }: SidebarProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = conversations.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (deleteId && onDelete) {
      onDelete(deleteId);
    }
    setDeleteId(null);
  };

  const handleEditClick = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingId && onRename && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditTitle("");
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
              onClick={() => editingId !== conv.id && onSelect(conv.id)}
              data-testid={`sidebar-conversation-${conv.id}`}
            >
              <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                <MessageSquare className={cn(
                  "w-4 h-4 shrink-0",
                  activeId === conv.id ? "text-indigo-600" : "text-neutral-400"
                )} />
                <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                  {editingId === conv.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-6 text-sm py-0 px-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(e as any);
                          if (e.key === 'Escape') handleCancelEdit(e as any);
                        }}
                        data-testid={`input-rename-${conv.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={handleSaveEdit}
                        data-testid={`button-save-rename-${conv.id}`}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-neutral-500 hover:text-neutral-700"
                        onClick={handleCancelEdit}
                        data-testid={`button-cancel-rename-${conv.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="truncate">{conv.title}</span>
                      <span className="text-[10px] text-neutral-400 font-normal truncate">
                        {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {editingId !== conv.id && (
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200"
                    onClick={(e) => handleEditClick(e, conv)}
                    data-testid={`button-edit-${conv.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-neutral-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200"
                    onClick={(e) => handleDeleteClick(e, conv.id)}
                    data-testid={`button-delete-${conv.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
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

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
