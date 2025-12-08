import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { ARC_COLORS, ARC_COLOR_NAMES } from "@/lib/arc-colors";

interface ColorPaletteProps {
  selectedColor: number;
  onColorSelect: (color: number) => void;
  className?: string;
}

export function ColorPalette({
  selectedColor,
  onColorSelect,
  className,
}: ColorPaletteProps) {
  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = parseInt(e.key);
      if (!isNaN(key) && key >= 0 && key <= 9) {
        onColorSelect(key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onColorSelect]);

  return (
    <div className={cn("flex flex-wrap gap-2 justify-center p-4 bg-white rounded-lg border border-neutral-200 shadow-sm", className)}>
      {ARC_COLORS.map((color, index) => (
        <button
          key={index}
          onClick={() => onColorSelect(index)}
          className={cn(
            "w-10 h-10 rounded-md border-2 transition-all duration-200 relative group focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2",
            selectedColor === index
              ? "border-neutral-900 scale-110 z-10 shadow-md"
              : "border-transparent hover:scale-105 hover:border-neutral-300"
          )}
          style={{ backgroundColor: color }}
          title={`${index}: ${ARC_COLOR_NAMES[index]}`}
          aria-label={`Select color ${index}: ${ARC_COLOR_NAMES[index]}`}
          aria-pressed={selectedColor === index}
        >
          <span className="sr-only">{ARC_COLOR_NAMES[index]}</span>
          <span
            className={cn(
              "absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-mono font-bold text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity",
              selectedColor === index && "opacity-100 text-neutral-900"
            )}
          >
            {index}
          </span>
          {selectedColor === index && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white shadow-sm ring-1 ring-black/20" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
