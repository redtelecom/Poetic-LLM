import React, { useState, useEffect } from "react";
import { Grid } from "@/components/arc/Grid";
import { ColorPalette } from "@/components/arc/ColorPalette";
import { SAMPLE_TASKS, Task } from "@/lib/arc-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, RotateCcw, Copy, Check, Maximize2, MoveRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Home() {
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [task, setTask] = useState<Task>(SAMPLE_TASKS[0]);
  const [selectedColor, setSelectedColor] = useState(0);
  
  // Output grid state
  const [outputGrid, setOutputGrid] = useState<number[][]>([]);
  const [gridSize, setGridSize] = useState({ rows: 3, cols: 3 });

  // Initialize output grid when task changes
  useEffect(() => {
    setTask(SAMPLE_TASKS[currentTaskIndex]);
  }, [currentTaskIndex]);

  useEffect(() => {
    // Default to test input size or something reasonable
    if (task.test[0]) {
      const input = task.test[0].input;
      const rows = input.length;
      const cols = input[0]?.length || 0;
      setGridSize({ rows, cols });
      setOutputGrid(createEmptyGrid(rows, cols));
    }
  }, [task]);

  const createEmptyGrid = (rows: number, cols: number) => {
    return Array(rows).fill(0).map(() => Array(cols).fill(0));
  };

  const handleCellClick = (row: number, col: number) => {
    const newGrid = [...outputGrid];
    newGrid[row] = [...newGrid[row]]; // Clone row
    newGrid[row][col] = selectedColor;
    setOutputGrid(newGrid);
  };

  const handleResize = () => {
    const newGrid = createEmptyGrid(gridSize.rows, gridSize.cols);
    // Preserve existing data if possible
    for (let i = 0; i < Math.min(outputGrid.length, gridSize.rows); i++) {
      for (let j = 0; j < Math.min(outputGrid[0].length, gridSize.cols); j++) {
        newGrid[i][j] = outputGrid[i][j];
      }
    }
    setOutputGrid(newGrid);
    toast({
      title: "Grid Resized",
      description: `Output grid resized to ${gridSize.rows}x${gridSize.cols}`,
    });
  };

  const handleCopyInput = () => {
    const input = task.test[0].input;
    // Deep copy
    const newInput = input.map(row => [...row]);
    setGridSize({ rows: input.length, cols: input[0].length });
    setOutputGrid(newInput);
    toast({
      title: "Copied Input",
      description: "Test input copied to output grid",
    });
  };

  const handleReset = () => {
    setOutputGrid(createEmptyGrid(gridSize.rows, gridSize.cols));
    toast({
      title: "Grid Reset",
      description: "Output grid cleared to black (0)",
    });
  };

  const handleSubmit = () => {
    // In a real app, we'd check against the hidden solution
    toast({
      title: "Solution Submitted",
      description: "This is a frontend prototype. Logic would go here!",
      variant: "default",
    });
  };

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-lg">
            P
          </div>
          <h1 className="text-xl font-bold tracking-tight">Poetiq ARC-AGI Solver</h1>
          <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs rounded-full border border-neutral-200">
            Frontend Prototype
          </span>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="text-sm text-neutral-500">
             Task: <span className="font-mono text-neutral-900 font-medium">{task.id}</span>
           </div>
           <div className="flex gap-1">
             <Button 
               variant="outline" 
               size="sm"
               onClick={() => setCurrentTaskIndex(prev => Math.max(0, prev - 1))}
               disabled={currentTaskIndex === 0}
             >
               Previous
             </Button>
             <Button 
               variant="outline" 
               size="sm"
               onClick={() => setCurrentTaskIndex(prev => Math.min(SAMPLE_TASKS.length - 1, prev + 1))}
               disabled={currentTaskIndex === SAMPLE_TASKS.length - 1}
             >
               Next
             </Button>
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-[1600px] mx-auto grid grid-cols-12 gap-8 h-full">
          
          {/* Left Panel: Training Examples */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-y-auto pr-2 max-h-[calc(100vh-100px)] custom-scrollbar">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold text-neutral-800">Training Examples</h2>
              <span className="text-sm text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">{task.train.length} pairs</span>
            </div>
            
            {task.train.map((pair, idx) => (
              <Card key={idx} className="border-neutral-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-neutral-50/50 py-3 px-4 border-b border-neutral-100">
                  <CardTitle className="text-sm font-medium text-neutral-500">Example {idx + 1}</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Input</span>
                      <Grid data={pair.input} cellSize={20} />
                    </div>
                    <ArrowRight className="text-neutral-300 w-6 h-6 shrink-0 rotate-90 sm:rotate-0" />
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Output</span>
                      <Grid data={pair.output} cellSize={20} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Center Panel: Test Input */}
          <div className="col-span-12 md:col-span-5 lg:col-span-4 flex flex-col gap-6">
             <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold text-neutral-800">Test Input</h2>
            </div>
            
            <Card className="border-neutral-200 shadow-sm flex-1 flex flex-col items-center justify-center p-8 bg-neutral-50/30">
               <div className="relative group">
                 <Grid data={task.test[0].input} cellSize={35} className="shadow-lg" />
                 <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-neutral-400 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    {task.test[0].input.length}x{task.test[0].input[0].length}
                 </div>
               </div>
            </Card>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">Instructions:</p>
              <p>Analyze the pattern in the training examples on the left, then apply that same transformation logic to the test input above to create the solution on the right.</p>
            </div>
          </div>

          {/* Right Panel: Output Editor */}
          <div className="col-span-12 md:col-span-7 lg:col-span-4 flex flex-col gap-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-neutral-800">Your Solution</h2>
            </div>

            <Card className="border-neutral-200 shadow-md flex flex-col h-full bg-white">
              {/* Toolbar */}
              <div className="p-3 border-b border-neutral-100 flex flex-wrap gap-2 justify-between items-center bg-neutral-50/50">
                 <div className="flex items-center gap-2">
                   <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded-md px-2 py-1">
                     <span className="text-xs text-neutral-400 uppercase font-bold mr-1">Size</span>
                     <Input 
                       type="number" 
                       min={1} 
                       max={30}
                       value={gridSize.rows} 
                       onChange={(e) => setGridSize({...gridSize, rows: parseInt(e.target.value) || 1})}
                       className="w-10 h-6 p-0 text-center border-none shadow-none focus-visible:ring-0 text-xs"
                     />
                     <span className="text-neutral-300">×</span>
                     <Input 
                       type="number" 
                       min={1} 
                       max={30}
                       value={gridSize.cols} 
                       onChange={(e) => setGridSize({...gridSize, cols: parseInt(e.target.value) || 1})}
                       className="w-10 h-6 p-0 text-center border-none shadow-none focus-visible:ring-0 text-xs"
                     />
                     <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={handleResize} title="Apply Resize">
                       <Check className="w-3 h-3 text-green-600" />
                     </Button>
                   </div>
                 </div>

                 <div className="flex gap-1">
                   <Button variant="outline" size="sm" className="h-8 px-2 text-xs gap-1.5" onClick={handleCopyInput}>
                     <Copy className="w-3.5 h-3.5" />
                     Copy Input
                   </Button>
                   <Button variant="outline" size="sm" className="h-8 px-2 text-xs gap-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200" onClick={handleReset}>
                     <RotateCcw className="w-3.5 h-3.5" />
                     Reset
                   </Button>
                 </div>
              </div>

              {/* Editor Area */}
              <div className="flex-1 flex items-center justify-center p-8 bg-neutral-100/30 overflow-auto min-h-[300px]">
                <Grid 
                  data={outputGrid} 
                  editable={true} 
                  onCellClick={handleCellClick} 
                  cellSize={35}
                  className="shadow-xl ring-1 ring-black/5"
                />
              </div>

              {/* Color Picker */}
              <div className="p-4 border-t border-neutral-200 bg-neutral-50">
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 text-center">Palette</div>
                <ColorPalette selectedColor={selectedColor} onColorSelect={setSelectedColor} />
              </div>
              
              {/* Submit Action */}
              <div className="p-4 border-t border-neutral-200 bg-white">
                <Button className="w-full h-12 text-base font-semibold shadow-blue-500/20 shadow-lg" onClick={handleSubmit}>
                  Submit Solution
                </Button>
              </div>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
