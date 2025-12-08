import React from "react";
import { cn } from "@/lib/utils";
import { ARC_COLORS } from "@/lib/arc-colors";

interface GridProps {
  data: number[][];
  editable?: boolean;
  onCellClick?: (row: number, col: number) => void;
  className?: string;
  cellSize?: number;
}

export function Grid({
  data,
  editable = false,
  onCellClick,
  className,
  cellSize = 30, // Default cell size
}: GridProps) {
  const rows = data.length;
  const cols = data[0]?.length || 0;

  return (
    <div
      className={cn(
        "inline-grid gap-[1px] bg-neutral-200 border border-neutral-300 p-[1px]",
        className
      )}
      style={{
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
      }}
    >
      {data.map((row, rowIndex) =>
        row.map((cellValue, colIndex) => (
          <div
            key={`${rowIndex}-${colIndex}`}
            className={cn(
              "w-full h-full transition-colors duration-75",
              editable && "cursor-pointer hover:opacity-90 active:scale-95 transform",
              !editable && "cursor-default"
            )}
            style={{
              backgroundColor: ARC_COLORS[cellValue],
            }}
            onClick={() => editable && onCellClick?.(rowIndex, colIndex)}
            role={editable ? "button" : "gridcell"}
            aria-label={`Cell at ${rowIndex},${colIndex} with color ${cellValue}`}
          />
        ))
      )}
    </div>
  );
}
